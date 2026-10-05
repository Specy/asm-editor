/* A typical exercise: a singly linked list on the heap with sorted insertion, deletion, reversal, searching and
 * freeing, plus a dynamic array that grows with realloc. */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

struct node { int value; char label[12]; struct node *next; };

static struct node *insert_sorted(struct node *head, int value)
{
	struct node *n = malloc(sizeof *n);
	n->value = value;
	snprintf(n->label, sizeof n->label, "item%d", value);
	if (!head || value < head->value) {
		n->next = head;
		return n;
	}
	struct node *p = head;
	while (p->next && p->next->value <= value) p = p->next;
	n->next = p->next;
	p->next = n;
	return head;
}

static struct node *remove_value(struct node *head, int value)
{
	struct node **pp = &head;
	while (*pp) {
		if ((*pp)->value == value) {
			struct node *dead = *pp;
			*pp = dead->next;
			free(dead);
		} else {
			pp = &(*pp)->next;
		}
	}
	return head;
}

static struct node *reverse(struct node *head)
{
	struct node *prev = NULL;
	while (head) {
		struct node *next = head->next;
		head->next = prev;
		prev = head;
		head = next;
	}
	return prev;
}

static void print_list(const char *label, const struct node *n)
{
	printf("%s:", label);
	for (; n; n = n->next) printf(" %s", n->label);
	printf("\n");
}

int main(void)
{
	int values[] = { 42, 7, 19, 7, 100, -3, 64, 19, 0 };
	struct node *head = NULL;
	for (unsigned i = 0; i < sizeof values / sizeof *values; i++) head = insert_sorted(head, values[i]);
	print_list("sorted", head);
	head = remove_value(head, 19);
	head = remove_value(head, -3);
	print_list("removed 19 and -3", head);
	head = reverse(head);
	print_list("reversed", head);
	while (head) {
		struct node *next = head->next;
		free(head);
		head = next;
	}
	int *dyn = NULL;
	size_t len = 0, cap = 0;
	for (int i = 0; i < 1000; i++) {
		if (len == cap) {
			cap = cap ? cap * 2 : 4;
			dyn = realloc(dyn, cap * sizeof *dyn);
		}
		dyn[len++] = i * i % 1009;
	}
	long sum = 0;
	for (size_t i = 0; i < len; i++) sum += dyn[i];
	printf("dynamic array len=%zu cap=%zu sum=%ld\n", len, cap, sum);
	free(dyn);
	return 0;
}
