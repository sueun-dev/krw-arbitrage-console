import { main } from "./cli";

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

