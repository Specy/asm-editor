/* Binary data: fwrite and fread of int arrays and structs, all 256 byte values, and the File size from
 * fseek(SEEK_END) and ftell. */
#include <stdio.h>
#include <string.h>

struct record { int id; short count; char tag[6]; };

int main(void)
{
	int values[8] = { 0, 1, -1, 255, 256, 65536, 0x7fffffff, -0x7fffffff - 1 };
	struct record recs[2] = { { 7, 300, "alpha" }, { -9, -2, "beta" } };
	unsigned char all[256];
	for (int i = 0; i < 256; i++) all[i] = (unsigned char)i;
	FILE *f = fopen("data.bin", "wb");
	size_t w1 = fwrite(values, sizeof values[0], 8, f);
	size_t w2 = fwrite(recs, sizeof recs[0], 2, f);
	size_t w3 = fwrite(all, 1, 256, f);
	printf("wrote %zu %zu %zu\n", w1, w2, w3);
	fclose(f);
	f = fopen("data.bin", "rb");
	fseek(f, 0, SEEK_END);
	long size = ftell(f);
	printf("size=%ld expected=%zu\n", size, sizeof values + sizeof recs + sizeof all);
	rewind(f);
	int back[8];
	struct record rback[2];
	unsigned char aback[256];
	size_t r1 = fread(back, sizeof back[0], 8, f);
	size_t r2 = fread(rback, sizeof rback[0], 2, f);
	size_t r3 = fread(aback, 1, 256, f);
	printf("read %zu %zu %zu\n", r1, r2, r3);
	printf("equal: %d %d %d\n", memcmp(back, values, sizeof back) == 0, memcmp(rback, recs, sizeof recs) == 0,
		memcmp(aback, all, 256) == 0);
	printf("rec: %d %d %s / %d %d %s\n", rback[0].id, rback[0].count, rback[0].tag, rback[1].id, rback[1].count,
		rback[1].tag);
	r1 = fread(aback, 1, 10, f);
	printf("fread past end=%zu feof=%d\n", r1, feof(f) != 0);
	fseek(f, 3 * (long)sizeof(int), SEEK_SET);
	int v;
	fread(&v, sizeof v, 1, f);
	printf("value at index 3=%d\n", v);
	fclose(f);
	return 0;
}
