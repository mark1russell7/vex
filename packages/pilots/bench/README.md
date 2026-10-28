# The speed of the schema pilot

The pilot EXAMPLE.SCHEMA is the schema roll-up of Graph. Graph needs 5 ms or less for one sample of 20 documents of 30 fields. The speed job of the nightly workflow starts two scripts:

- `schema-speed.ts` measures the warm interpreter. Each case runs 40 times after 10 runs, and the script gives the median.
- `schema-cold.ts` measures the first sample in 10 new processes. It gives the median and the range of each part: `import`, `compile`, `first` and `second`.

The job puts the numbers into the artifact `bench-report`, in `bench.txt`, `schema-speed.json` and `schema-cold.json`.

## How to read the numbers

The runners of CI are not all of the same speed. The same code gave a warm median of 21.6 ms on one run and 29.7 ms on the next run. Thus obey these rules:

1. Compare a case with the references of the same run, not with the numbers of a different run.
2. For a change of speed, use the column `per calibration`. `calibration` is a fixed work of plain JavaScript. Its time follows the speed of the runner.
3. Give the median of the ratio over 5 nightly runs or more. Do not give the ratio of one run as a result.
4. For each number, tell if it is warm or cold, and if it is a median or a mean.
5. The column `per TypeScript` compares a case with the code of Graph. That reference takes less than 1 ms, and its noise is high. Do not use it to measure a change.

## Cold and warm time

Graph pays the cold time when a process evaluates the pilot for the first time. A faster op does not make `import` or `compile` faster. If `import` is most of the cold time, a host can load and run the pilot one time when it starts. Then each sample of a user gets the warm time.

## How to get the numbers of the nightly runs

```sh
gh run list -R mark1russell7/vex --workflow nightly.yml --limit 5 --json databaseId
gh run download <id> -R mark1russell7/vex -n bench-report -D reports/<id>
```
