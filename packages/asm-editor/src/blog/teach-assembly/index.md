## A browser workspace for assembly classes

ASM Editor brings a code editor, simulator, debugger, and testcases into one browser workspace. Students can run examples directly from a lesson or project link, while instructors can prepare projects that open with the files and configuration already in place.

The workspace supports MIPS, RISC-V, M68K, Z80, and x86. The [courses](/learn/courses) and [reference documentation](/documentation) provide lessons and runnable examples for use alongside your own material.

## Prepare and share projects

[Create a project](/projects/create), choose its language, and add the source files students will use. A project can include a worked example, starter code, supporting files, and testcases.

**Share** copies a link containing a snapshot of the project's files, configuration, and cases. Each recipient gets an editable copy. Create a new link when you want to distribute a revised version.

This gives students the same starting program and checks, with room to edit and debug their own copy. The [getting-started guide](/blog/posts/getting-started) introduces the workspace controls.

## Check programs with testcases

Built-in testcases can supply starting registers, memory, and scripted input, then check expected output, registers, or memory after execution. A program does not need to print an answer for its result to be checked.

Choose **Test** to run the configured cases, then open **Testcases** to inspect the results. The tables show **Actual** values beside **Expected** values, so students can inspect a failed check and return to the debugger to investigate it.

![Testcases showing actual register values beside expected results for a MIPS exercise.](/images/blog/teach-assembly/testcases.webp)

Use several cases to check different inputs. Testcase starting values apply to Test; an ordinary Run uses the program's own initialization and interactive input.

## Put runnable examples in lessons

The [embed builder](/embed) creates an editor you can include in a lesson page. Configure the program, its testcases, and the panels you want visible, then copy **Embed URL** for a direct link or the iframe code for a page that accepts HTML embeds.

**Show tests** makes the testcase controls available; add the cases themselves in the preview's Testcases panel. Enable the **Open in editor button** so students can continue in a full project when they need more space or several files.

The embedded example and full editor use the same simulator and execution controls. Students can move from reading a lesson to running its program, setting breakpoints, and inspecting state.

## Support practice and assessment

The debugger keeps source, registers, memory, execution history, and the call stack together. Breakpoints pause a program at a chosen instruction; Step and Undo let students inspect recent changes while working on an exercise.

The [Exam builder](/exam) provides assembly coding, C coding, multiple-choice, and open-question sections, with time-limit and password controls. It offers a separate way to organize an assessment around the editor's coding tools.

## Try ASM Editor

The embedded MIPS example demonstrates a register check. Choose **Test**, then **Testcases** to inspect the result in `$t2`.

The **Try ASM Editor** button opens the same program as a project with two prepared cases: 17 + 25 and -3 + 8. Choose **Test** to run both. You can edit the cases and use **Share** to create your own project link. These checks use registers, so the program prints no terminal output.

```mips|playground|tests|tall|allow-open
.text
.globl main
main:
    add $t2, $t0, $t1

    li $v0, 10
    syscall
```

```testcase
{
    "name": "Two positive numbers",
    "startingRegisters": { "$t0": 17, "$t1": 25 },
    "expectedRegisters": { "$t2": 42 }
}
```

<p><a class="blog-try-button" href="/projects/share?project=N4IgVgzg9gdiBcoBmBLANgUwg0BbAhijAHS4oAO2iIGMAxlACZEDmCI5ahcANCAzAAutQe2LCAHoIA6JFmigAjNAAICRWepjxZKvSvyNGKgCSCATD1OCADFbMBGWbv1oUpgG52VDmy70QAJ4QdPhoaLIgAL5RfCIAToHsWqQU2HwQGIKCrFTAsfzxGPjCjACCovB2IACu5IwlGOWV1TD4uBjsZUYoObAqwhCCoZnpIFwwLDX4LJ3wIACyAJIACgDKIHyMWHTxFH1w85sgg8P4owgA2qBD+PE5kwBKGCwoQxjxeSBmNuwOAOzHRzscwAVmicQk5AwdFKz1e70+OG+FnYABZzBCQLd7qwFhhcFBElcALqQ6Gwpr4wnE+CXMkgIjkGqVenkmGlADyLOZlRAxzaHXYABUAO5QFTkKAQXooDwYFQwGq4RQfbCxG6CO4PFjwt7CJHUH7sAC0AGYgYIHOwABxYjBQjlNPWIr5mTHzcEFHE66lEpJ0hkOimlP20tmMmC80nsymMbmCaNHPiCuYgMqKl4lOUKpks6IMlCMdgAfRLEAAFncMGXjg72ggleEtm9OPgA020AUOlrkR4wjUsMjTiMsMQbMQfawXQaIMRjXSQIoUK8hCAGSPzmOJ1Oni99Wr51arkuV0RRBusGdRuPiMGnYwZ4f3Sfl6uL3xNzeHJOtbi9wis5Hr8i5vue66fleo5zj+u66vurpHtaoFnmul5DNBxA-vecZPp8R4epcp7vhBNASA2i41DA2yoDATSkcwEBtgGRFUTRRD0SSBQeAgDgxEAA">Try ASM Editor →</a></p>
