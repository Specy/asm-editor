/* assert with true conditions does nothing; with NDEBUG defined before a later #include <assert.h> the macro
 * no longer evaluates its argument. */
#include <stdio.h>
#include <assert.h>

static int calls;
static int counted(void) { return ++calls; }

int main(void)
{
	assert(1 + 1 == 2);
	assert(counted());
	printf("calls after assert=%d\n", calls);
#define NDEBUG
#include <assert.h>
	assert(counted() == 1000);
	printf("calls after NDEBUG assert=%d\n", calls);
#undef NDEBUG
#include <assert.h>
	assert(counted() == 2);
	printf("calls after assert again=%d\n", calls);
	static_assert(sizeof(int) >= 2, "int is at least 16 bits");
	return 0;
}
