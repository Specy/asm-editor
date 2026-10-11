// Calling a pure virtual function from a base-class constructor reaches __cxa_pure_virtual, which prints a message
// and aborts with status 134. libstdc++ adds a "terminate called" line, so stderr is fixed in
// cpp_pure_virtual.expect.stderr. The status is fixed too: at -O2 the glibc oracle's only, weak, reference into
// libstdc++ makes the host linker drop libstdc++, and the oracle crashes at address 0. GCC references
// __cxa_pure_virtual weakly; the Cores pull its member through the library's resolveWeak list (README.md, Linking).
#include <cstdio>

struct Shape {
	Shape() { std::puts("Shape constructor calls describe()"); std::fflush(stdout); init(); }
	void init() { describe(); }
	virtual void describe() = 0;
	virtual ~Shape() {}
};

struct Circle : Shape {
	void describe() override { std::puts("circle"); }
};

int main()
{
	Circle c;
	std::puts("not reached");
	return 0;
}
