# An Executable is a Project File a Build loads

A binary built outside the editor is opened as an **Executable**: a File of an x86 Project, named by the Entry path, which a Build loads instead of assembling, so the Debug session that follows is an ordinary one. The Project already supplies what a CTF workflow needs around a binary (the files it opens, the input it reads, Testcases that check a solution, notes, saving and sharing), and the only concepts that stretch are Build ("assemble or load") and Breakpoint (an Executable has no source lines).

## Considered options

- **A separate binary inspector outside Projects.** Simpler at first, but it would need its own Terminal, FileSystem, saving and sharing.
- **A new Target ("x86 binary").** A Target is the machine and environment programs run on, and those are the x86 ones; only the input differs.
