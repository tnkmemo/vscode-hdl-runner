import * as fs from "fs";
import * as path from "path";
import { RegressionConfig } from "../config/settings";

export interface TestResult {
  name: string;
  status: "queued" | "skipped" | "success" | "failed";
  errors: number;
  warnings: number;
  vcd: string | null;
  coverage: number | null;
}

export interface RegressionResult {
  tests: TestResult[];
  timestamp: string;
}

export interface ResultMetadata {
  filepath: string;
  timestamp: string;
  totalTests: number;
  failedTests: number;
  passedTests: number;
  errorTests: number;
  warningTests: number;
  successRate: number; // 0-100
  executionTime?: number; // in milliseconds
}

export class LogParser {
  private errorPatterns: RegExp[];
  private warningPatterns: RegExp[];

  constructor(config: RegressionConfig) {
    this.errorPatterns = config.logPatterns.error.map(
      (pattern) => new RegExp(pattern, "i")
    );
    this.warningPatterns = config.logPatterns.warning.map(
      (pattern) => new RegExp(pattern, "i")
    );
  }

  /**
   * Parse log content and count errors and warnings
   */
  parseLog(logContent: string): { errors: number; warnings: number } {
    let errors = 0;
    let warnings = 0;

    const lines = logContent.split(/\r?\n/);

    for (const line of lines) {
      // Try to match error patterns (OR condition)
      if (this.errorPatterns.some((pattern) => pattern.test(line))) {
        errors++;
      }
      // Try to match warning patterns (OR condition)
      else if (this.warningPatterns.some((pattern) => pattern.test(line))) {
        warnings++;
      }
    }

    return { errors, warnings };
  }
}

export class ResultCollector {
  private logParser: LogParser;
  private readonly MAX_RESULTS = 20; // Keep last 20 results

  constructor(private config: RegressionConfig) {
    this.logParser = new LogParser(config);
  }

  /**
   * Collect test results from log files
   * @param allTestNames List of all test names
   * @param plannedTestNames List of test names that were planned to run
   * @param runDir Run directory containing logs and outputs (required)
   */
  collectResults(
    allTestNames: string[],
    plannedTestNames: string[],
    runDir: string
  ): RegressionResult {
    const tests: TestResult[] = [];

    for (const testName of allTestNames) {
      let errors = 0;
      let warnings = 0;
      let status: "queued" | "skipped" | "success" | "failed" = "skipped";

      // Try new path: runDir/logs/<testname>/seed_<SEED>/sim.log
      const testLogDir = path.join(runDir, "logs", testName);
      if (fs.existsSync(testLogDir)) {
        const seedDirs = fs.readdirSync(testLogDir).filter(dir => dir.startsWith("seed_"));
        if (seedDirs.length > 0) {
          // Use the first seed directory (assuming single seed per test for now)
          const seedDir = seedDirs[0];
          const logPath = path.join(testLogDir, seedDir, "sim.log");
          if (fs.existsSync(logPath)) {
            try {
              const logContent = fs.readFileSync(logPath, "utf-8");
              const counts = this.logParser.parseLog(logContent);
              errors = counts.errors;
              warnings = counts.warnings;
              status = errors > 0 ? "failed" : "success";
            } catch (e) {
              console.error(`Failed to read log file ${logPath}:`, e);
            }
          }
        }
      }

      // If log not found but test was planned, it's queued (still running or waiting)
      if (status === "skipped" && plannedTestNames.includes(testName)) {
        status = "queued";
      }

      // Try to locate VCD file
      let vcd: string | null = null;
      const testWaveDir = path.join(runDir, "waves", testName);
      if (fs.existsSync(testWaveDir)) {
        const seedDirs = fs.readdirSync(testWaveDir).filter(dir => dir.startsWith("seed_"));
        if (seedDirs.length > 0) {
          const seedDir = seedDirs[0];
          const vcdPath = path.join(testWaveDir, seedDir, "wave.vcd");
          if (fs.existsSync(vcdPath)) {
            vcd = vcdPath;
          }
        }
      }

      tests.push({
        name: testName,
        status,
        errors,
        warnings,
        vcd,
        coverage: null // Phase 2: implement coverage parsing
      });
    }

    return {
      tests,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Save regression results to JSON file
   * @param results Regression results to save
   * @param runDir Run directory path
   * @returns Path to saved file
   */
  saveResults(results: RegressionResult, runDir: string): string {
    try {
      // Use runDir/results directory
      const resultsDir = path.join(runDir, "results");
      if (!fs.existsSync(resultsDir)) {
        fs.mkdirSync(resultsDir, { recursive: true });
      }

      // Generate filename with date and unique_id from runDir
      const runDirName = path.basename(runDir); // run_YYMMDDHHNNSS_uniqueId
      const filename = `regression_${runDirName}.json`;
      const filepath = path.join(resultsDir, filename);

      // Write JSON file
      fs.writeFileSync(filepath, JSON.stringify(results, null, 2), "utf-8");

      return filepath;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to save regression results: ${message}`);
    }
  }

  /**
   * Get path to latest results file
   * @param workspaceRoot Workspace root path
   * @returns Path to latest JSON file or null if none exists
   */
  getLatestResultsFile(workspaceRoot: string): string | null {
    try {
      const outDir = path.join(workspaceRoot, "out");
      if (!fs.existsSync(outDir)) {
        return null;
      }

      // Find all run directories
      const runDirs = fs.readdirSync(outDir)
        .filter(dir => dir.startsWith("run_") && fs.statSync(path.join(outDir, dir)).isDirectory())
        .map(dir => path.join(outDir, dir))
        .filter(runDir => fs.existsSync(path.join(runDir, "results")));

      if (runDirs.length === 0) {
        return null;
      }

      // Collect all JSON files from all runDir/results directories
      const allFiles: string[] = [];
      for (const runDir of runDirs) {
        const resultsDir = path.join(runDir, "results");
        const files = fs.readdirSync(resultsDir).filter((f) =>
          f.startsWith("regression_") && f.endsWith(".json")
        );
        for (const file of files) {
          allFiles.push(path.join(resultsDir, file));
        }
      }

      if (allFiles.length === 0) {
        return null;
      }

      // Sort by filename (descending) to get the latest
      allFiles.sort().reverse();
      return allFiles[0];
    } catch (error) {
      console.error("Failed to get latest results file:", error);
      return null;
    }
  }

  /**
   * Get metadata from a regression result file
   * @param filepath Path to result JSON file
   * @returns Result metadata or null if file cannot be read
   */
  private getResultMetadata(filepath: string): ResultMetadata | null {
    try {
      const content = fs.readFileSync(filepath, "utf-8");
      const result: RegressionResult = JSON.parse(content);

      const failedTests = result.tests.filter((t) => t.errors > 0).length;
      const passedTests = result.tests.length - failedTests;
      const errorTests = result.tests.reduce((sum, t) => sum + t.errors, 0);
      const warningTests = result.tests.reduce((sum, t) => sum + t.warnings, 0);
      const successRate = result.tests.length > 0 
        ? Math.round((passedTests / result.tests.length) * 100)
        : 0;

      return {
        filepath,
        timestamp: result.timestamp,
        totalTests: result.tests.length,
        failedTests,
        passedTests,
        errorTests,
        warningTests,
        successRate
      };
    } catch (error) {
      console.error(`Failed to parse result file ${filepath}:`, error);
      return null;
    }
  }

  /**
   * Get all regression result metadata (sorted by latest first)
   * @param workspaceRoot Workspace root path
   * @returns Array of result metadata, limited to MAX_RESULTS
   */
  getAllResults(workspaceRoot: string): ResultMetadata[] {
    try {
      const outDir = path.join(workspaceRoot, "out");
      if (!fs.existsSync(outDir)) {
        return [];
      }

      // Find all run directories
      const runDirs = fs.readdirSync(outDir)
        .filter(dir => dir.startsWith("run_") && fs.statSync(path.join(outDir, dir)).isDirectory())
        .map(dir => path.join(outDir, dir))
        .filter(runDir => fs.existsSync(path.join(runDir, "results")));

      if (runDirs.length === 0) {
        return [];
      }

      // Collect all JSON files from all runDir/results directories
      const allFiles: { filepath: string; runDir: string }[] = [];
      for (const runDir of runDirs) {
        const resultsDir = path.join(runDir, "results");
        const files = fs.readdirSync(resultsDir).filter((f) =>
          f.startsWith("regression_") && f.endsWith(".json")
        );
        for (const file of files) {
          allFiles.push({
            filepath: path.join(resultsDir, file),
            runDir: runDir
          });
        }
      }

      // Sort by filename (descending) to get the latest first
      allFiles.sort((a, b) => b.filepath.localeCompare(a.filepath));

      const metadata: ResultMetadata[] = [];
      for (const fileInfo of allFiles.slice(0, this.MAX_RESULTS)) {
        const meta = this.getResultMetadata(fileInfo.filepath);
        if (meta) {
          metadata.push(meta);
        }
      }

      return metadata;
    } catch (error) {
      console.error("Failed to get all results:", error);
      return [];
    }
  }

  /**
   * Load a specific regression result from file
   * @param filepath Path to result JSON file
   * @returns Regression result or null if file cannot be read
   */
  loadResult(filepath: string): RegressionResult | null {
    try {
      const content = fs.readFileSync(filepath, "utf-8");
      return JSON.parse(content);
    } catch (error) {
      console.error(`Failed to load result from ${filepath}:`, error);
      return null;
    }
  }
}
