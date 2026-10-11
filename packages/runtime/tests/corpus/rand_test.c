/* rand and srand: values stay in [0, RAND_MAX], a seed repeats its sequence, the default seed is 1, and the
 * values vary. The values themselves differ between libraries, so only properties are printed. */
#include <stdio.h>
#include <stdlib.h>

int main(void)
{
	int first[5], again[5], seeded1[5], other[5];
	for (int i = 0; i < 5; i++) first[i] = rand();
	srand(42);
	for (int i = 0; i < 5; i++) again[i] = rand();
	srand(1);
	for (int i = 0; i < 5; i++) seeded1[i] = rand();
	srand(42);
	int same = 1, default_is_1 = 1, differs = 0;
	for (int i = 0; i < 5; i++) {
		other[i] = rand();
		same &= other[i] == again[i];
		default_is_1 &= first[i] == seeded1[i];
		differs |= again[i] != seeded1[i];
	}
	printf("RAND_MAX >= 32767: %d\n", RAND_MAX >= 32767);
	printf("same seed repeats: %d\n", same);
	printf("no srand equals srand(1): %d\n", default_is_1);
	printf("different seeds differ: %d\n", differs);
	int in_range = 1, distinct = 0, prev = -1, buckets[4] = { 0 };
	for (int i = 0; i < 10000; i++) {
		int r = rand();
		in_range &= r >= 0 && r <= RAND_MAX;
		distinct += r != prev;
		prev = r;
		buckets[r % 4]++;
	}
	printf("in range: %d\n", in_range);
	printf("consecutive values differ: %d\n", distinct > 9900);
	int balanced = 1;
	for (int i = 0; i < 4; i++) balanced &= buckets[i] > 2000 && buckets[i] < 3000;
	printf("roughly uniform mod 4: %d\n", balanced);
	int dice[6] = { 0 };
	srand(2024);
	for (int i = 0; i < 6000; i++) dice[rand() % 6]++;
	int fair = 1;
	for (int i = 0; i < 6; i++) fair &= dice[i] > 800 && dice[i] < 1200;
	printf("dice fair: %d\n", fair);
	return 0;
}
