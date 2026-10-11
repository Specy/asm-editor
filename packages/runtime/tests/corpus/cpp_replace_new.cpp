// A program may replace the global operator new and operator delete. Its definitions win, and the library's
// other operators (new[], sized delete, ...) forward to them.
#include <cstdio>
#include <cstdlib>
#include <new>

// Replacing only some operators is the point of this test.
#pragma GCC diagnostic ignored "-Wsized-deallocation"

// volatile: GCC assumes replaced allocation functions leave global state alone (-fassume-sane-operators-new).
static volatile int allocations, deallocations;
// Storing the pointer in a volatile makes it escape, so GCC cannot elide the allocation (C++14 allows that).
static int *volatile escape;

void *operator new(std::size_t size)
{
	allocations++;
	void *p = std::malloc(size ? size : 1);
	if (!p) std::abort();
	return p;
}

void operator delete(void *p) noexcept
{
	if (p) deallocations++;
	std::free(p);
}

struct Node {
	int value;
	Node *next;
	virtual ~Node() {}
};

int main()
{
	Node *head = nullptr;
	for (int i = 0; i < 5; i++) {
		Node *n = new Node;
		n->value = i;
		n->next = head;
		head = n;
	}
	int *arr = new int[8];
	escape = arr;
	for (int i = 0; i < 8; i++) arr[i] = i;
	int sum = arr[7] - 7;
	std::printf("array allocations counted=%d\n", allocations == 6);
	delete[] arr;
	while (head) {
		Node *n = head;
		head = head->next;
		sum += n->value;
		delete n;
	}
	std::printf("sum=%d allocations=%d deallocations=%d\n", sum, allocations, deallocations);
	return 0;
}
