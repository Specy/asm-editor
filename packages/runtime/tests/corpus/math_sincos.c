/* sin and cos of the same argument: at -O2 GCC turns the pair into one call to sincos (and sincosf for float),
 * so the library must provide them even though the program never names them. */
#include <stdio.h>
#include <math.h>

static void rotate(double angle, double *x, double *y)
{
	double c = cos(angle), s = sin(angle);
	double nx = *x * c - *y * s, ny = *x * s + *y * c;
	*x = nx;
	*y = ny;
}

static float rotatef(float angle, float v)
{
	return v * cosf(angle) + v * sinf(angle);
}

/* volatile keeps GCC from folding the calls away at compile time */
static volatile double step = M_PI / 6;
static volatile float half = 0.5f;

int main(void)
{
	double x = 1, y = 0;
	for (int i = 0; i < 12; i++) {
		rotate(step, &x, &y);
		printf("%2d: %8.5f %8.5f\n", i, fabs(x) < 1e-9 ? 0.0 : x, fabs(y) < 1e-9 ? 0.0 : y);
	}
	printf("rotatef=%.5f\n", rotatef(half, 2.0f));
	return 0;
}
