module.exports = {
    preset: "ts-jest",
    testEnvironment: "node",
    testMatch: ["**/src/test/**/*.test.ts", "**/src/test/**/*test.*.ts"], // Add your test directory pattern
    clearMocks: true,
    coverageDirectory: "coverage",
    moduleDirectories: ["node_modules", "src"], // Ensure proper module resolution
  };