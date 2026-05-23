# vscode-hdl-runner

`VSCode HDL Runner` is a VS Code extension designed to streamline hardware design and verification using SystemVerilog, Verilog and VHDL. It provides parallel simulation execution, automatic log error analysis, regression result visualization, and seamless integration with waveform viewers.

## Key Features

- **Tree View Management**: Displays execution commands in a tree format, making it easy to run specific tools or tests.
- **Regression Panel**: A Webview panel allows you to monitor test progress and pass/fail status in real-time.
- **Log Analysis**: Scans simulation logs to automatically identify errors and warnings.
- **Parallel Test Execution**: Runs multiple tests in parallel to significantly reduce verification time.
- **File Monitoring**: Detects changes in `filelist.f` or source code and automatically resets test statuses.

## Get Started

### 1. Minimal Configuration
Create a `.vscode/settings.json` file and define the minimum configuration required to run a simulation.

```json
{
  "hdlRunner.items": {
    "sim": {
      "type": "group",
      "items": {
        "compile": {
          "type": "stage",
          "command": "iverilog -g2012 -o sim.out -f filelist.f"
        },
        "runTest": {
          "type": "stage",
          "dependsOn": ["sim.compile"], 
          "command": "vvp sim.out"
        }
      }
    }
  },
  "hdlRunner.tests": {
    "sample_test": { "plusargs": [] }
  }
}
```

### 2. Create a File List
Create a list of synthesizable/simulatable files and save it as `filelist.f`.

### 3. Enable HDL Runner
Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and execute the following command to activate the extension:

> **HDL Runner: Enable Extension**

Once activated, the items will appear in the `HDL Runner` section of the Tree View.

### 4. Run Tests
From the items displayed in the Tree View, click (or batch execute) the following in order to start the simulation:

1. **compile**: Compiles the source code.
2. **runTest**: Executes the actual simulation.

After completion, logs will be output to the `out/run_YYMMDD/logs/<testname>/` folder, and you can review the results via the panel.

### 5. Check Results
Execute the `HDL Runner: Open Regression Panel` command to open the panel.

You can view the specific logs by clicking **Open Log** within the panel.

## Paths and Placeholders

When used within the `command` property, the following placeholders are automatically replaced with a unique runtime directory path (e.g., `out/run_YYMMDD...`) generated for each execution. This prevents log and waveform data conflicts during parallel execution.

- `${logs}`: Output destination for simulation logs.
- `${works}`: Working directory for compilation and simulation.
- `${waves}`: Output destination for waveform data (VCD, etc.).
- `${covs}`: Output destination for coverage data.
- `${results}`: Storage location for regression results (JSON).

## Configuration Example

Customize your environment by adding the following settings to `.vscode/settings.json`:

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
            // runTest / runSelectedTest / runAllTest are reserved keywords
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

    // Tools such as Lint or CDC
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

  // Registering test cases
  "hdlRunner.tests": {
    "test1": { "plusargs": ["test1"] },
    "test2": { "plusargs": ["test2"] },
    "test3": { "plusargs": ["test3"] },
    "test4": { "plusargs": ["test4"] },
    "test5": { "plusargs": ["test5"] }
  },

  // Extensions to monitor within +incdir+ in filelist.f
  "hdlRunner.includeExts": ["*.svh"],

  // Regex patterns for log analysis
  "hdlRunner.logPatterns": {
    "error": ["ERROR", "%Error"],
    "warning": ["WARNING", "%Warning"]
  },

  // Limit for maximum parallel executions
  "hdlRunner.maxParallel": 1,

  // Goal line configuration for regression panel
  // Displays a target curve on the Pass chart.
  // startValue defaults to 0 and endValue defaults to the latest test count.
  "hdlRunner.regression.goalLine": {
    "startDate": "2026-01-01",
    "endDate": "2026-12-31"
  }
}
```
