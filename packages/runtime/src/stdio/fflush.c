/* Flush output and reconcile unread bytes with the shared descriptor position. */
#include "stdio_impl.h"
int fflush(FILE *f)
{
    if (!f) {
        int result = fflush(stdout) | fflush(stderr);
        for (f = __aed_open_streams; f; f = f->next_open) result |= fflush(f);
        return result;
    }
    if (f->wpos != f->wbase) {
        f->write(f, 0, 0);
        if (!f->wpos) return EOF;
    }
    if (f->rpos != f->rend && f->seek(f, f->rpos - f->rend, SEEK_CUR) < 0) return EOF;
    f->wpos = f->wbase = f->wend = 0;
    f->rpos = f->rend = 0;
    return 0;
}
void __stdio_exit(void) { fflush(0); }
