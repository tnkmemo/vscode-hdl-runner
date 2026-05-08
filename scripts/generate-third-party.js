const fs = require("fs");
const { execSync } = require("child_process");

function generateNotices() {
  console.log("Generating THIRD-PARTY-NOTICES.txt ...");

  const output = execSync(
    "npx license-checker --production --json",
    { encoding: "utf8" }
  );

  const data = JSON.parse(output);
  let notices = "";

  for (const [pkg, info] of Object.entries(data)) {
    notices += "------------------------------------------------------------\n";
    notices += `Package: ${pkg}\n`;
    notices += `License: ${info.licenses}\n`;
    if (info.repository) notices += `Repository: ${info.repository}\n`;
    if (info.publisher) notices += `Publisher: ${info.publisher}\n`;
    if (info.email) notices += `Email: ${info.email}\n`;
    notices += "\n";

    if (info.licenseText) {
      notices += info.licenseText.trim() + "\n";
    } else {
      notices += "(License text not provided by package)\n";
    }

    notices += "\n";
  }

  fs.writeFileSync("THIRD-PARTY-NOTICES.txt", notices);
  console.log("Done: THIRD-PARTY-NOTICES.txt");
}

generateNotices();