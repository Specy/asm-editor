/* Reading a provided input File with fscanf and fgets, and writing a report File with fprintf. */
#include <stdio.h>
#include <string.h>

int main(void)
{
	FILE *in = fopen("numbers.txt", "r");
	if (!in) { perror("numbers.txt"); return 1; }
	char title[64];
	fgets(title, sizeof title, in);
	title[strcspn(title, "\n")] = 0;
	int count = 0;
	double x, sum = 0, min = 1e300, max = -1e300;
	while (fscanf(in, "%lf", &x) == 1) {
		count++;
		sum += x;
		if (x < min) min = x;
		if (x > max) max = x;
	}
	char tail[32] = "";
	int r = fscanf(in, "%31s", tail);
	printf("stopped at [%s] r=%d, feof=%d\n", tail, r, feof(in) != 0);
	fclose(in);
	FILE *out = fopen("report.txt", "w");
	fprintf(out, "%s\n", title);
	fprintf(out, "count %d\nsum %.3f\nmean %.4f\nmin %g\nmax %g\n", count, sum, sum / count, min, max);
	fclose(out);
	out = fopen("report.txt", "r");
	char line[80];
	while (fgets(line, sizeof line, out)) fputs(line, stdout);
	fclose(out);
	return 0;
}
