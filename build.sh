#!/bin/bash
export PATH="D:/work/code/claude-app/tools/node:$PATH"
cd "D:/work/code/claude-app/mobile/android"
cmd.exe /c "gradlew.bat assembleRelease"
