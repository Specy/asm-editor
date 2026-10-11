/* The float functions sinf, cosf, tanf, expf, logf, powf and sincosf, printed with 6 significant digits. */
/* glibc declares the GNU extension sincos only with _GNU_SOURCE; the Runtime headers always declare it. */
#define _GNU_SOURCE
#include <stdio.h>
#include <math.h>

int main(void)
{
	float xs[] = { 0.0f, 0.1f, 0.5f, 1.0f, -1.0f, 2.0f, 3.14159265f, 10.0f, -7.25f, 50.0f, 88.0f, 1e-5f, 1e6f, 1e30f };
	for (unsigned i = 0; i < sizeof xs / sizeof *xs; i++) {
		float x = xs[i];
		printf("x=%g sinf=%.6g cosf=%.6g tanf=%.6g expf=%.6g", x, sinf(x), cosf(x), tanf(x), expf(x));
		float l = logf(x);
		if (isnan(l)) printf(" logf=nan\n");
		else printf(" logf=%.6g\n", l);
	}
	float pw[][2] = { { 2, 10 }, { 2, 0.5f }, { 10, -2 }, { -2, 3 }, { 0, 0 }, { 1.5f, 2.5f }, { 2, 130 }, { 2, -150 } };
	for (unsigned i = 0; i < sizeof pw / sizeof *pw; i++) printf("powf(%g, %g)=%.6g\n", pw[i][0], pw[i][1], powf(pw[i][0], pw[i][1]));
	float s, c;
	sincosf(2.0f, &s, &c);
	printf("sincosf(2)=%.6g %.6g\n", s, c);
	return 0;
}
