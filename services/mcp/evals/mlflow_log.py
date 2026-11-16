"""Log an agent-eval run to MLflow: the summary, the report, and one trace per question.

Kept apart from run_eval.py because MLflow is in the `eval` dependency group only: CI and the
deployed server don't install it. `basic` because without MLflow installed every MLflow type is
unknown, which strict mode would report on each line.
"""

# pyright: basic

import time
from pathlib import Path
from typing import Any

import mlflow  # pyright: ignore[reportMissingImports]
from mlflow.entities import AssessmentSource, SpanType  # pyright: ignore[reportMissingImports]
from run_eval import Outcome, score, summarize


def log_mlflow(
    questions: list[dict[str, Any]],
    outcomes: list[Outcome],
    params: dict[str, str],
    report_text: str,
    tracking_uri: str,
    artifacts: Path,
) -> str:
    """Log the run (params, summary metrics, report, per-question table) and one trace per
    question: a root span for the question with a child span per tool call, plus the pass/fail
    as an assessment on the trace, so failures can be read in the MLflow UI. Returns the run id."""
    mlflow.set_tracking_uri(tracking_uri)
    name = "mcp-agent-eval"
    if mlflow.get_experiment_by_name(name) is None:
        mlflow.create_experiment(name, artifact_location=(artifacts / "mlruns").as_uri())
    mlflow.set_experiment(name)
    scorer = AssessmentSource(source_type="CODE", source_id="run_eval.score")
    verdicts: list[tuple[str, bool, str]] = []
    with mlflow.start_run(run_name=params.get("model")) as run:
        mlflow.log_params(params)
        metrics = summarize(questions, outcomes)
        mlflow.log_metrics({k: float(v) for k, v in metrics.items()})
        mlflow.log_text(report_text, "report.md")
        table: dict[str, list[Any]] = {
            "id": [],
            "passed": [],
            "called": [],
            "missing": [],
            "answer": [],
        }
        for q, o in zip(questions, outcomes, strict=True):
            s = score(q, o.called, o.answer)
            for key, value in (
                ("id", o.id),
                ("passed", s["passed"]),
                ("called", ", ".join(o.called)),
                ("missing", ", ".join(s["missing"])),
                ("answer", o.answer),
            ):
                table[key].append(value)
            start = o.steps[0].start_ns if o.steps else time.time_ns()
            root = mlflow.start_span_no_context(
                o.id,
                span_type=SpanType.AGENT,
                inputs={"question": q["question"]},
                attributes={"lang": o.lang, "turns": str(o.turns)},
                tags={"question_id": o.id},
                start_time_ns=start,
            )
            for step in o.steps:
                span = mlflow.start_span_no_context(
                    step.tool,
                    span_type=SpanType.TOOL,
                    parent_span=root,
                    inputs=step.input,
                    start_time_ns=step.start_ns,
                )
                span.end(
                    outputs=step.output,
                    status="ERROR" if step.is_error else "OK",
                    end_time_ns=step.end_ns,
                )
            # o.seconds is the whole CLI run, from before the first tool call
            root.end(
                outputs={"answer": o.answer, "error": o.error},
                status="ERROR" if o.error else "OK",
                end_time_ns=max([start + int(o.seconds * 1e9), *(x.end_ns for x in o.steps)]),
            )
            why = f"missing: {', '.join(s['missing']) or '-'}; answer check: {q['check']}"
            verdicts.append((root.trace_id, bool(s["passed"]), why))
        mlflow.log_table(table, "questions.json")
        mlflow.flush_trace_async_logging()  # traces are written in the background
        for trace_id, passed, why in verdicts:
            mlflow.log_feedback(
                trace_id=trace_id, name="passed", value=passed, source=scorer, rationale=why
            )
    return run.info.run_id
