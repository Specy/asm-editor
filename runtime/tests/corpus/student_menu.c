/* A typical interactive program: a command loop reading words and numbers with scanf until "quit" or the end of
 * input, keeping a small bank account. */
#include <stdio.h>
#include <string.h>

int main(void)
{
	char cmd[16];
	double balance = 0, amount;
	int count = 0;
	printf("commands: deposit N, withdraw N, balance, quit\n");
	while (printf("> "), scanf("%15s", cmd) == 1) {
		count++;
		if (strcmp(cmd, "quit") == 0) break;
		if (strcmp(cmd, "deposit") == 0 || strcmp(cmd, "withdraw") == 0) {
			if (scanf("%lf", &amount) != 1) {
				printf("expected an amount\n");
				scanf("%*s");
				continue;
			}
			if (cmd[0] == 'w') {
				if (amount > balance) {
					printf("insufficient funds\n");
					continue;
				}
				amount = -amount;
			}
			balance += amount;
			printf("ok, balance %.2f\n", balance);
		} else if (strcmp(cmd, "balance") == 0) {
			printf("balance %.2f\n", balance);
		} else {
			printf("unknown command '%s'\n", cmd);
		}
	}
	printf("\n%d commands, final balance %.2f\n", count, balance);
	return 0;
}
