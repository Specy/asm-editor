/* Derived from musl 1.2.6 src/exit/atexit.c (MIT, see runtime/third_party/musl/COPYRIGHT).
 * Changes: no locks or fork hooks; uses the library's calloc. */
#include <stdlib.h>
#include <stdint.h>
#include "features.h"

#define LOCK(x) ((void)0)
#define UNLOCK(x) ((void)0)

/* Ensure that at least 32 atexit handlers can be registered without malloc */
#define COUNT 32

static struct fl
{
	struct fl *next;
	void (*f[COUNT])(void *);
	void *a[COUNT];
} builtin, *head;

static int finished_atexit;
static int slot;

void __funcs_on_exit(void)
{
	void (*func)(void *), *arg;
	LOCK(lock);
	for (; head; head=head->next, slot=COUNT) while(slot-->0) {
		func = head->f[slot];
		arg = head->a[slot];
		UNLOCK(lock);
		func(arg);
		LOCK(lock);
	}
	/* Unlock to prevent deadlock if a global dtor
	 * attempts to call atexit. */
	finished_atexit = 1;
	UNLOCK(lock);
}

void __cxa_finalize(void *dso)
{
}

int __cxa_atexit(void (*func)(void *), void *arg, void *dso)
{
	LOCK(lock);

	/* Prevent dtors from registering further atexit
	 * handlers that would never be run. */
	if (finished_atexit) {
		UNLOCK(lock);
		return -1;
	}

	/* Defer initialization of head so it can be in BSS */
	if (!head) head = &builtin;

	/* If the current function list is full, add a new one */
	if (slot==COUNT) {
		struct fl *new_fl = calloc(sizeof(struct fl), 1);
		if (!new_fl) {
			UNLOCK(lock);
			return -1;
		}
		new_fl->next = head;
		head = new_fl;
		slot = 0;
	}

	/* Append function to the list. */
	head->f[slot] = func;
	head->a[slot] = arg;
	slot++;

	UNLOCK(lock);
	return 0;
}

static void call(void *p)
{
	((void (*)(void))(uintptr_t)p)();
}

int atexit(void (*func)(void))
{
	return __cxa_atexit(call, (void *)(uintptr_t)func, 0);
}
