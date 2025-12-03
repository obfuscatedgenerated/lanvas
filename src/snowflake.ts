import { Snowflake } from "@sapphire/snowflake";

export const SNOWFLAKE_EPOCH = new Date(2025, 0, 1);

const snowflake = new Snowflake(SNOWFLAKE_EPOCH);
export default snowflake;
