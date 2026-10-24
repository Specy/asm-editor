// SPDX-License-Identifier: Apache-2.0 WITH LLVM-exception
//
// The editor's C++ demangler: LLVM libc++abi's Itanium demangler, asked for the parts of a name
// rather than one string. It parses with the `ItaniumDemangle.h` that Emscripten's libc++abi ships
// (system/lib/libcxxabi/src/demangle) and reads the parts off the syntax tree as LLVM's
// `ItaniumPartialDemangler` does (llvm/lib/Demangle/ItaniumDemangle.cpp). `parse_discriminator`,
// `BumpPointerAllocator` and `DefaultAllocator` are copied from libc++abi's `cxa_demangle.cpp`.
// Part of the work is the LLVM Project's, under the Apache License v2.0 with LLVM Exceptions; see
// https://llvm.org/LICENSE.txt and src/lib/languages/demangle/LICENSE.txt.

#include <cctype>
#include <cstdlib>
#include <cstring>
#include <string>
#include <string_view>
#include <vector>

#define DEMANGLE_ASSERT(expr, message) ((void)0)
#include "demangle/ItaniumDemangle.h"

using namespace itanium_demangle;

// As libc++abi's cxa_demangle.cpp defines it: parse but ignore a discriminator.
const char *itanium_demangle::parse_discriminator(const char *first, const char *last) {
  if (first != last) {
    if (*first == '_') {
      const char *t1 = first + 1;
      if (t1 != last) {
        if (std::isdigit(*t1))
          first = t1 + 1;
        else if (*t1 == '_') {
          for (++t1; t1 != last && std::isdigit(*t1); ++t1)
            ;
          if (t1 != last && *t1 == '_')
            first = t1 + 1;
        }
      }
    } else if (std::isdigit(*first)) {
      const char *t1 = first + 1;
      for (; t1 != last && std::isdigit(*t1); ++t1)
        ;
      if (t1 == last)
        first = last;
    }
  }
  return first;
}

namespace {
// As libc++abi's cxa_demangle.cpp defines them.
class BumpPointerAllocator {
  struct BlockMeta {
    BlockMeta *Next;
    size_t Current;
  };

  static constexpr size_t AllocSize = 4096;
  static constexpr size_t UsableAllocSize = AllocSize - sizeof(BlockMeta);

  alignas(long double) char InitialBuffer[AllocSize];
  BlockMeta *BlockList = nullptr;

  void grow() {
    char *NewMeta = static_cast<char *>(std::malloc(AllocSize));
    if (NewMeta == nullptr)
      std::abort();
    BlockList = new (NewMeta) BlockMeta{BlockList, 0};
  }

  void *allocateMassive(size_t NBytes) {
    NBytes += sizeof(BlockMeta);
    BlockMeta *NewMeta = reinterpret_cast<BlockMeta *>(std::malloc(NBytes));
    if (NewMeta == nullptr)
      std::abort();
    BlockList->Next = new (NewMeta) BlockMeta{BlockList->Next, 0};
    return static_cast<void *>(NewMeta + 1);
  }

public:
  BumpPointerAllocator() : BlockList(new (InitialBuffer) BlockMeta{nullptr, 0}) {}

  void *allocate(size_t N) {
    N = (N + 15u) & ~15u;
    if (N + BlockList->Current >= UsableAllocSize) {
      if (N > UsableAllocSize)
        return allocateMassive(N);
      grow();
    }
    BlockList->Current += N;
    return static_cast<void *>(reinterpret_cast<char *>(BlockList + 1) + BlockList->Current - N);
  }

  void reset() {
    while (BlockList) {
      BlockMeta *Tmp = BlockList;
      BlockList = BlockList->Next;
      if (reinterpret_cast<char *>(Tmp) != InitialBuffer)
        std::free(Tmp);
    }
    BlockList = new (InitialBuffer) BlockMeta{nullptr, 0};
  }

  ~BumpPointerAllocator() { reset(); }
};

class DefaultAllocator {
  BumpPointerAllocator Alloc;

public:
  void reset() { Alloc.reset(); }

  template <typename T, typename... Args> T *makeNode(Args &&...args) {
    return new (Alloc.allocate(sizeof(T))) T(std::forward<Args>(args)...);
  }

  void *allocateNodeArray(size_t sz) { return Alloc.allocate(sizeof(Node *) * sz); }
};

/// LLVM's parser, remembering which constructor names were inheriting (`CI1`, `CI2`), which the
/// tree itself forgets.
struct Parser : AbstractManglingParser<Parser, DefaultAllocator> {
  using Base = AbstractManglingParser<Parser, DefaultAllocator>;
  using Base::Base;
  std::vector<const Node *> inheriting;

  Node *parseCtorDtorName(Node *&SoFar, NameState *State) {
    bool inherited = look() == 'C' && look(1) == 'I';
    Node *name = Base::parseCtorDtorName(SoFar, State);
    if (name != nullptr && inherited)
      inheriting.push_back(name);
    return name;
  }
};

/// A function's qualifiers as LLVM prints them: ` const`, ` volatile`, ` restrict`, ` &`, ` &&`.
std::string qualifiers(const FunctionEncoding &function) {
  std::string text;
  Qualifiers cv = function.getCVQuals();
  if (cv & QualConst)
    text += " const";
  if (cv & QualVolatile)
    text += " volatile";
  if (cv & QualRestrict)
    text += " restrict";
  if (function.getRefQual() == FrefQualLValue)
    text += " &";
  else if (function.getRefQual() == FrefQualRValue)
    text += " &&";
  return text;
}

// What the editor's shortening reads in place of a template-id's brackets and commas, so it never
// has to tell `operator<` from a template argument list.
constexpr std::string_view Open = "\x01";
constexpr std::string_view Close = "\x02";
constexpr std::string_view Separator = "\x03";
constexpr char Field = '\x1f';

// The most text each part of a name may print to, and the most nodes printing one part may visit.
// A name can be made to print far more than it is long: `B<T, T>` nested, each level doubling the
// text, prints 25 MB from 162 characters. Past either, `describe` reads nothing.
constexpr size_t LongestText = 64 * 1024;
constexpr size_t MostPrints = 1 << 20;

/// Prints as LLVM does until its text is over `LongestText` or it has visited `MostPrints` nodes,
/// then prints nothing more and says it `overflowed`.
class CappedBuffer : public OutputBuffer {
  size_t prints = 0;

protected:
  /// Whether to print nothing more, counting the print about to be made.
  bool full() {
    if (getCurrentPosition() > LongestText || ++prints > MostPrints)
      overflowed = true;
    return overflowed;
  }

public:
  bool overflowed = false;

  void printLeft(const Node &node) override {
    if (!full())
      OutputBuffer::printLeft(node);
  }

  void printRight(const Node &node) override {
    if (!full())
      OutputBuffer::printRight(node);
  }
};

/// Prints as LLVM does, except that template argument lists are bracketed by `Open` and `Close`,
/// their arguments (a pack's elements each one) parted by `Separator`, `std::string` and the
/// stream substitutions spelled as the templates they stand for, `[abi:…]` tags left out, and a
/// function's encoding inside a name (the function a local entity is in) without its return type:
/// `std::string::_M_construct<char const*>(char const*, …)::_Guard`, not `void std::string::…`.
/// Capped as `CappedBuffer` is.
class MarkedBuffer final : public CappedBuffer {
  void printArguments(NodeArray arguments, bool &first) {
    for (size_t i = 0; i != arguments.size(); ++i) {
      const Node *argument = arguments[i];
      if (argument->getKind() == Node::KTemplateArgumentPack) {
        static_cast<const TemplateArgumentPack *>(argument)->match(
            [&](NodeArray elements) { printArguments(elements, first); });
        continue;
      }
      size_t before = getCurrentPosition();
      if (!first)
        *this += Separator;
      size_t after = getCurrentPosition();
      argument->printAsOperand(*this, Node::Prec::Comma);
      // An empty pack expansion prints nothing, and takes its separator with it.
      if (after == getCurrentPosition()) {
        setCurrentPosition(before);
        continue;
      }
      first = false;
    }
  }

  void printSubstitution(SpecialSubKind kind) {
    switch (kind) {
    case SpecialSubKind::allocator:
      *this += "std::allocator";
      return;
    case SpecialSubKind::basic_string:
      *this += "std::basic_string";
      return;
    case SpecialSubKind::string:
      *this += "std::basic_string";
      break;
    case SpecialSubKind::istream:
      *this += "std::basic_istream";
      break;
    case SpecialSubKind::ostream:
      *this += "std::basic_ostream";
      break;
    case SpecialSubKind::iostream:
      *this += "std::basic_iostream";
      break;
    }
    *this += Open;
    *this += "char";
    *this += Separator;
    *this += "std::char_traits";
    *this += Open;
    *this += "char";
    *this += Close;
    if (kind == SpecialSubKind::string) {
      *this += Separator;
      *this += "std::allocator";
      *this += Open;
      *this += "char";
      *this += Close;
    }
    *this += Close;
  }

public:
  void printLeft(const Node &node) override {
    if (full())
      return;
    switch (node.getKind()) {
    case Node::KTemplateArgs:
      static_cast<const TemplateArgs &>(node).match([&](NodeArray parameters, Node *) {
        ScopedOverride<bool> inside(TemplateTracker.InsideTemplate, true);
        *this += Open;
        bool first = true;
        printArguments(parameters, first);
        *this += Close;
      });
      return;
    case Node::KAbiTagAttr:
      printLeft(*static_cast<const AbiTagAttr &>(node).Base);
      return;
    case Node::KExpandedSpecialSubstitution:
      static_cast<const ExpandedSpecialSubstitution &>(node).match(
          [&](SpecialSubKind kind) { printSubstitution(kind); });
      return;
    case Node::KFunctionEncoding:
      static_cast<const FunctionEncoding &>(node).getName()->print(*this);
      return;
    default:
      OutputBuffer::printLeft(node);
    }
  }

  void printRight(const Node &node) override {
    if (full())
      return;
    if (node.getKind() != Node::KFunctionEncoding) {
      OutputBuffer::printRight(node);
      return;
    }
    auto &function = static_cast<const FunctionEncoding &>(node);
    printOpen();
    function.getParams().printWithComma(*this);
    printClose();
    *this += qualifiers(function);
  }
};

/// Prints the parts of a name, and remembers whether any of them was cut short.
struct Printer {
  bool overflowed = false;

  /// What a buffer printed, which it frees; '' once it overflowed.
  std::string text(CappedBuffer &out) {
    overflowed |= out.overflowed || out.getCurrentPosition() > LongestText;
    std::string printed(overflowed || out.getBuffer() == nullptr ? "" : out.getBuffer(),
                        overflowed ? 0 : out.getCurrentPosition());
    std::free(out.getBuffer());
    return printed;
  }

  /// The demangler's own text of a node.
  std::string plain(const Node *node) {
    CappedBuffer out;
    node->print(out);
    return text(out);
  }

  /// The marked text of a node (`MarkedBuffer`).
  std::string marked(const Node *node) {
    MarkedBuffer out;
    node->print(out);
    return text(out);
  }
};

/// The constructor or destructor a function's name ends in, as its mangled variant: `C1`, `C2`,
/// `C3`, `CI1`, `CI2`, `D0`, `D1`, `D2` (and GCC's `C4`, `C5`, `D4`, `D5`), or '' for none.
std::string ctorDtorVariant(const Node *name, const Parser &parser) {
  for (;;) {
    switch (name->getKind()) {
    case Node::KAbiTagAttr:
      name = static_cast<const AbiTagAttr *>(name)->Base;
      continue;
    case Node::KNameWithTemplateArgs:
      name = static_cast<const NameWithTemplateArgs *>(name)->Name;
      continue;
    case Node::KNestedName:
      name = static_cast<const NestedName *>(name)->Name;
      continue;
    case Node::KLocalName:
      name = static_cast<const LocalName *>(name)->Entity;
      continue;
    case Node::KModuleEntity:
      name = static_cast<const ModuleEntity *>(name)->Name;
      continue;
    case Node::KMemberLikeFriendName:
      name = static_cast<const MemberLikeFriendName *>(name)->Name;
      continue;
    case Node::KCtorDtorName: {
      std::string variant;
      static_cast<const CtorDtorName *>(name)->match([&](const Node *, bool isDtor, int number) {
        variant = isDtor ? "D" : "C";
        for (const Node *inherited : parser.inheriting)
          if (inherited == name)
            variant += 'I';
        variant += std::to_string(number);
      });
      return variant;
    }
    default:
      return "";
    }
  }
}
} // namespace

/// The parts of a mangled name (`_Z…`), or null when LLVM's demangler cannot read it. Nine fields
/// parted by U+001F, the text ones marked as `MarkedBuffer` prints them unless said otherwise:
///
/// 1. kind: `function` when the name, past a special name's words, is a function's encoding, else
///    `data`;
/// 2. the demangler's own text of the whole name, unmarked: what `__cxa_demangle` returns;
/// 3. a special name's words, unmarked: `vtable for `, `non-virtual thunk to `, or '';
/// 4. the qualified name: a function's without return type and parameters, else the whole name
///    after the special words (`construction vtable for A-in-B`'s `A-in-B`);
/// 5. a function's parameters with their parentheses: `(int, char const*)`;
/// 6. a function's return type, which only template functions mangle;
/// 7. a function's qualifiers, unmarked: ` const`, ` volatile`, ` restrict`, ` &`, ` &&`;
/// 8. a constructor's or destructor's variant, unmarked (`ctorDtorVariant`);
/// 9. a GCC clone suffix, unmarked: `.isra.0.cold`.
///
/// Null too when a part prints over `LongestText` or visits `MostPrints` nodes. The caller frees
/// the result.
extern "C" char *describe(const char *mangled) {
  size_t length = std::strlen(mangled);
  // Only `_Z` names: LLVM's `parse` reads a type too, so `i` alone would read as `int`.
  if (length < 2 || mangled[0] != '_' || mangled[1] != 'Z')
    return nullptr;
  Parser parser(mangled, mangled + length);
  Node *root = parser.parse();
  if (root == nullptr)
    return nullptr;

  Printer print;
  std::string whole = print.plain(root);
  if (print.overflowed)
    return nullptr;
  std::string kind = "data", special, name, parameters, returns, cvQualifiers, variant, clone;
  const Node *node = root;
  if (node->getKind() == Node::KDotSuffix)
    static_cast<const DotSuffix *>(node)->match([&](const Node *prefix, std::string_view suffix) {
      node = prefix;
      clone = std::string(suffix);
    });
  if (node->getKind() == Node::KSpecialName)
    static_cast<const SpecialName *>(node)->match([&](std::string_view words, const Node *child) {
      special = std::string(words);
      node = child;
    });
  if (node->getKind() == Node::KCtorVtableSpecialName) {
    special = "construction vtable for ";
    static_cast<const CtorVtableSpecialName *>(node)->match(
        [&](const Node *first, const Node *second) {
          name = print.marked(first) + "-in-" + print.marked(second);
        });
  } else if (node->getKind() == Node::KFunctionEncoding) {
    auto *function = static_cast<const FunctionEncoding *>(node);
    kind = "function";
    name = print.marked(function->getName());
    MarkedBuffer out;
    out += '(';
    function->getParams().printWithComma(out);
    out += ')';
    parameters = print.text(out);
    if (function->getReturnType() != nullptr)
      returns = print.marked(function->getReturnType());
    cvQualifiers = qualifiers(*function);
    variant = ctorDtorVariant(function->getName(), parser);
  } else {
    name = print.marked(node);
  }
  if (print.overflowed)
    return nullptr;

  std::string out = kind;
  for (const std::string *part :
       {&whole, &special, &name, &parameters, &returns, &cvQualifiers, &variant, &clone}) {
    out += Field;
    out += *part;
  }
  char *result = static_cast<char *>(std::malloc(out.size() + 1));
  if (result == nullptr)
    return nullptr;
  std::memcpy(result, out.c_str(), out.size() + 1);
  return result;
}
