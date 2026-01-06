import "dotenv/config";

export const ENV = {
  PORT: parseInt(process.env.PORT || "10000", 10),
  HOST: process.env.HOST || "0.0.0.0",
  IXFI_API_BASE: process.env.BASE_API || "",
  IXFI_API_TOKEN: process.env.IXFI_API_TOKEN || "",
  USER_AGENT: "ixfi-app/1.0",
};
