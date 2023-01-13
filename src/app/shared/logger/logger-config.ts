import { Type } from "@angular/core";
import { DefaultLogAppender, LogAppender } from "./log-appender";
import { DefaultLogFormatter, LogFormatFn, LogFormatter } from "./log-formatter";
import { LogLevel } from "./log-level";

export abstract class LoggerConfig {
    abstract level: LogLevel;
    abstract chaining: boolean;
    abstract formatter: Type<LogFormatter> | LogFormatFn;
    abstract appenders: Type<LogAppender>[];
}

export const defaultConfig: LoggerConfig = {
    level: LogLevel.DEBUG,
    chaining: false,
    formatter: DefaultLogFormatter,
    appenders: [DefaultLogAppender]
}