// Global constructors run before main through .init_array, in definition order; destructors of globals and
// function-local statics run after main returns, interleaved with atexit handlers in reverse order of
// registration (C++ [basic.start.term]).
#include <cstdio>
#include <cstdlib>

struct Tracer {
	const char *name;
	explicit Tracer(const char *n) : name(n) { std::printf("construct %s\n", name); }
	~Tracer() { std::printf("destroy %s\n", name); }
};

Tracer first("global first");
Tracer second("global second");
static int initialized_value = std::printf("dynamic initializer of an int\n");

static void handler() { std::puts("atexit handler"); }

static Tracer &local()
{
	static Tracer t("function-local static");
	return t;
}

int main()
{
	std::printf("main starts, initializer returned %d\n", initialized_value);
	std::atexit(handler);
	local();
	local();
	std::printf("main returns\n");
	return 0;
}

Tracer third("global third, defined after main");
