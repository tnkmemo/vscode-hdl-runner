# vscode-hdl-runner

`VSCode HDL Runner` is a VS Code extension designed to streamline hardware design and verification using SystemVerilog and Verilog. It provides parallel simulation execution, automatic log-based error analysis, regression test results visualization, and seamless integration with waveform viewers.

## Key Features

- **Parallel Test Execution**: Run multiple tests in parallel to significantly reduce verification time.
- **Regression Test Dashboard**: Monitor real-time test progress and pass/fail status via a dedicated Webview panel.
- **Log Analysis**: Automatically identifies errors and warnings by scanning simulation logs.
- **File Watching**: Detects changes in `filelist.f` or source code and automatically resets the execution status of relevant stages.
- **Tree View Management**: Displays project structures in a tree format, allowing you to easily execute specific stages or tests.

## Configuration

Customize the extension by adding the following settings to your `.vscode/settings.json`.

```jsonc
{
  "hdlRunner.items": {
    // Simulation command configuration
    "sim": {
      "type": "group",
      "items": {
        "compile": {
          "type": "stage",
          "command": "<Compile command>"
        },
        "elaborate": {
          "type": "stage",
          "dependsOn": ["sim.compile"],
          "command": "<Elaborate command>"
        },
        "test": {
          "type": "group",
          "items": {
            // "runTest", "runSelectedTest", and "runAllTest" are reserved words
            "runTest": { 
              "type": "stage",
              "dependsOn": ["sim.elaborate"],
              "command": "<simulation run command ${works} ${waves} ${covs}>"
            },
            "runSelectedTest": { 
              "type": "stage",
              "dependsOn": ["sim.elaborate"],
              "command": "<simulation run command ${works} ${waves} ${covs}>"
            },
            "runAllTest": { 
              "type": "stage",
              "dependsOn": ["sim.elaborate"],
              "command": "<simulation run command ${works} ${waves} ${covs}>"
            }
          }
        }
      }
    },

    // Lint, CDC, or other tool configurations
    "Tools": {
      "type": "group",
      "items": {
        "lint": {
          "type": "stage",
          "command": "<lint run command>"
        }
      }
    }
  },

  // Test case registration
  "hdlRunner.tests": {
    "test1": { "plusargs": ["test1"] },
    "test2": { "plusargs": ["test2"] },
    "test3": { "plusargs": ["test3"] },
    "test4": { "plusargs": ["test4"] },
    "test5": { "plusargs": ["test5"] }
  },

  // File extensions to watch within +incdir+ specified in filelist.f
  "hdlRunner.includeExts": ["*.svh"],

  // Regex patterns for detecting errors and warnings in simulation logs
  "hdlRunner.logPatterns": {
    "error": ["ERROR", "%Error"],
    "warning": ["WARNING", "%Warning"]
  },

  // Maximum number of parallel executions
  "hdlRunner.maxParallel": 1
}
```

## Path Placeholders

Using the following placeholders within the `command` property will automatically replace them with a unique runtime directory path (e.g., `out/run_YYMMDD...`) generated for each execution. This prevents conflicts between log and waveform data during parallel runs.

- `${logs}`: Output directory for simulation logs.
- `${works}`: Working directory for compilation and simulation.
- `${waves}`: Output directory for waveform data (VCD, WLF, etc.).
- `${covs}`: Output directory for coverage data.
- `${results}`: Storage location for regression test results (JSON).

## Usage

1. **Run Tests**: Click an item in the `HDL Runner` icon located in the Activity Bar to execute it.
2. **Review Results**: Run the `Open Regression Panel` command to open the regression dashboard.
3. **Check Logs and Waveforms**: Click `Open Log` in the dashboard to view log files, or use the waveform viewer integration.
