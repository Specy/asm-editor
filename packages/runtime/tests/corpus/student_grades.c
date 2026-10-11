/* A typical exercise: read a class list from the Terminal, compute statistics, print a table and write a report
 * File. */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

struct student { char name[32]; double score; };

static int by_score(const void *a, const void *b)
{
	double x = ((const struct student *)a)->score, y = ((const struct student *)b)->score;
	return (x < y) - (x > y);
}

int main(void)
{
	int n;
	printf("How many students? ");
	if (scanf("%d", &n) != 1 || n <= 0) {
		printf("invalid count\n");
		return 1;
	}
	printf("%d\n", n);
	struct student *list = malloc(n * sizeof *list);
	int read = 0;
	while (read < n && scanf("%31s %lf", list[read].name, &list[read].score) == 2) read++;
	double sum = 0;
	for (int i = 0; i < read; i++) sum += list[i].score;
	qsort(list, read, sizeof *list, by_score);
	printf("%-12s|%8s\n", "Name", "Score");
	printf("------------+--------\n");
	for (int i = 0; i < read; i++) printf("%-12s|%8.2f\n", list[i].name, list[i].score);
	printf("read %d of %d, average %.3f, best %s\n", read, n, sum / read, list[0].name);
	FILE *report = fopen("report.txt", "w");
	fprintf(report, "students=%d\naverage=%.2f\n", read, sum / read);
	for (int i = 0; i < read; i++)
		fprintf(report, "%d. %s %s\n", i + 1, list[i].name, list[i].score >= 60 ? "pass" : "fail");
	fclose(report);
	free(list);
	return 0;
}
