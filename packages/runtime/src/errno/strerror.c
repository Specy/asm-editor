/* Runtime library: strerror (written for this library). The messages are glibc's, for the errno values that
 * <errno.h> defines; any other number gives "Unknown error". */
#include <errno.h>
#include <string.h>

char *strerror(int e)
{
	const char *s;

	switch (e) {
	case 0: s = "Success"; break;
	case EPERM: s = "Operation not permitted"; break;
	case ENOENT: s = "No such file or directory"; break;
	case EINTR: s = "Interrupted system call"; break;
	case EIO: s = "Input/output error"; break;
	case ENXIO: s = "No such device or address"; break;
	case EBADF: s = "Bad file descriptor"; break;
	case EAGAIN: s = "Resource temporarily unavailable"; break;
	case ENOMEM: s = "Cannot allocate memory"; break;
	case EACCES: s = "Permission denied"; break;
	case EFAULT: s = "Bad address"; break;
	case EBUSY: s = "Device or resource busy"; break;
	case EEXIST: s = "File exists"; break;
	case ENODEV: s = "No such device"; break;
	case ENOTDIR: s = "Not a directory"; break;
	case EISDIR: s = "Is a directory"; break;
	case EINVAL: s = "Invalid argument"; break;
	case EMFILE: s = "Too many open files"; break;
	case ENOTTY: s = "Inappropriate ioctl for device"; break;
	case ENOSPC: s = "No space left on device"; break;
	case ESPIPE: s = "Illegal seek"; break;
	case EPIPE: s = "Broken pipe"; break;
	case EDOM: s = "Numerical argument out of domain"; break;
	case ERANGE: s = "Numerical result out of range"; break;
	case ENOSYS: s = "Function not implemented"; break;
	case EOVERFLOW: s = "Value too large for defined data type"; break;
	case EILSEQ: s = "Invalid or incomplete multibyte or wide character"; break;
	case EOPNOTSUPP: s = "Operation not supported"; break;
	default: s = "Unknown error"; break;
	}
	return (char *)s;
}
