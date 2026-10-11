// new and delete: objects, arrays, nothrow, placement, over-aligned types (aligned new), and deleting a derived
// object through a base pointer with a virtual destructor (sized delete).
#include <cstdio>
#include <cstdint>
#include <cstring>
#include <new>

struct Base {
	int id;
	explicit Base(int i) : id(i) { std::printf("Base(%d)\n", id); }
	virtual ~Base() { std::printf("~Base(%d)\n", id); }
	virtual int value() const { return id; }
};

struct Derived : Base {
	char *name;
	Derived(int i, const char *n) : Base(i), name(new char[std::strlen(n) + 1]) {
		std::strcpy(name, n);
		std::printf("Derived(%s)\n", name);
	}
	~Derived() override {
		std::printf("~Derived(%s)\n", name);
		delete[] name;
	}
	int value() const override { return id * 10; }
};

struct alignas(64) Wide {
	char bytes[100];
};

struct Counted {
	static int live;
	Counted() { live++; }
	~Counted() { live--; }
};
int Counted::live = 0;

int main()
{
	int *p = new int(42);
	std::printf("new int = %d\n", *p);
	delete p;
	double *arr = new double[5]();
	std::printf("new double[5]() zeroed: %g %g\n", arr[0], arr[4]);
	delete[] arr;
	Base *b = new Derived(7, "seven");
	std::printf("virtual value = %d\n", b->value());
	delete b;
	Counted *many = new Counted[10];
	std::printf("live after new[] = %d\n", Counted::live);
	delete[] many;
	std::printf("live after delete[] = %d\n", Counted::live);
	int *q = new (std::nothrow) int[100];
	std::printf("nothrow new non-null = %d\n", q != nullptr);
	delete[] q;
	alignas(Derived) unsigned char storage[sizeof(Derived)];
	Derived *placed = new (storage) Derived(9, "placed");
	std::printf("placement at storage = %d\n", static_cast<void *>(placed) == static_cast<void *>(storage));
	placed->~Derived();
	Wide *w = new Wide;
	std::printf("aligned new: %d\n", reinterpret_cast<std::uintptr_t>(w) % 64 == 0);
	delete w;
	Wide *ws = new Wide[3];
	std::printf("aligned new[]: %d\n", reinterpret_cast<std::uintptr_t>(ws) % 64 == 0);
	delete[] ws;
	return 0;
}
