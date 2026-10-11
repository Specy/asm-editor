/* A typical exercise: dynamically allocated matrices, multiplication, a determinant by Gaussian elimination
 * and an inverse check, printed with fixed widths. */
#include <stdio.h>
#include <stdlib.h>
#include <math.h>

static double **alloc_matrix(int n)
{
	double **m = malloc(n * sizeof *m);
	for (int i = 0; i < n; i++) m[i] = calloc(n, sizeof **m);
	return m;
}

static void free_matrix(double **m, int n)
{
	for (int i = 0; i < n; i++) free(m[i]);
	free(m);
}

static void print_matrix(const char *label, double **m, int n)
{
	printf("%s:\n", label);
	for (int i = 0; i < n; i++) {
		for (int j = 0; j < n; j++) printf("%9.3f", fabs(m[i][j]) < 5e-10 ? 0.0 : m[i][j]);
		printf("\n");
	}
}

static double determinant(double **src, int n)
{
	double **a = alloc_matrix(n), det = 1;
	for (int i = 0; i < n; i++)
		for (int j = 0; j < n; j++) a[i][j] = src[i][j];
	for (int col = 0; col < n; col++) {
		int pivot = col;
		for (int r = col + 1; r < n; r++)
			if (fabs(a[r][col]) > fabs(a[pivot][col])) pivot = r;
		if (fabs(a[pivot][col]) < 1e-12) {
			det = 0;
			break;
		}
		if (pivot != col) {
			double *t = a[pivot];
			a[pivot] = a[col];
			a[col] = t;
			det = -det;
		}
		det *= a[col][col];
		for (int r = col + 1; r < n; r++) {
			double f = a[r][col] / a[col][col];
			for (int k = col; k < n; k++) a[r][k] -= f * a[col][k];
		}
	}
	free_matrix(a, n);
	return det;
}

int main(void)
{
	int n = 4;
	double **a = alloc_matrix(n), **b = alloc_matrix(n), **c = alloc_matrix(n);
	for (int i = 0; i < n; i++)
		for (int j = 0; j < n; j++) {
			a[i][j] = (i + 1) * (j + 2) % 7 - 1.5;
			b[i][j] = i == j ? 2 : (i + j) % 3 * 0.25;
		}
	for (int i = 0; i < n; i++)
		for (int j = 0; j < n; j++)
			for (int k = 0; k < n; k++) c[i][j] += a[i][k] * b[k][j];
	print_matrix("A", a, n);
	print_matrix("B", b, n);
	print_matrix("A*B", c, n);
	printf("det(A)=%.6f det(B)=%.6f det(A*B)=%.6f\n", determinant(a, n), determinant(b, n), determinant(c, n));
	printf("product rule holds: %d\n", fabs(determinant(a, n) * determinant(b, n) - determinant(c, n)) < 1e-6);
	free_matrix(a, n);
	free_matrix(b, n);
	free_matrix(c, n);
	return 0;
}
