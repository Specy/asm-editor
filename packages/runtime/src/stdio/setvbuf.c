/* Requested buffering is honoured; streams remain unbuffered by default. */
#include "stdio_impl.h"
#include <stdlib.h>
int setvbuf(FILE *restrict f, char *restrict buf, int type, size_t size)
{
    unsigned char *owned = 0;
    if (type != _IONBF && !(f->flags & F_NORD)) return -1;
    if (type != _IONBF && type != _IOLBF && type != _IOFBF) return -1;
    if (type != _IONBF) {
        if (!buf || !size) {
            size = size ? size : BUFSIZ;
            if (size > (size_t)-1 - UNGET) return -1;
            owned = malloc(size + UNGET);
            if (!owned) return -1;
            buf = (char *)owned + UNGET;
        }
    }
    if (fflush(f)) { free(owned); return -1; }
    if (!f->input_buffer) f->input_buffer = f->buf;
    free(f->owned_buffer);
    f->owned_buffer = owned;
    /* Keep input unbuffered: caller buffers do not have space for scanf pushback. */
    if (type != _IONBF && !(f->flags & F_NOWR)) {
        f->buf = (unsigned char *)buf;
        f->buf_size = size;
    } else { f->buf = f->input_buffer; f->buf_size = 0; }
    f->lbf = type == _IOLBF ? '\n' : EOF;
    f->wbase = f->wpos = f->wend = 0;
    f->flags |= F_SVB;
    return 0;
}
