"""Contrastive fine-tune of the embedding model on synthetic pairs (in-batch negatives).

Run: `uv run python -m hakuba_search.finetune [--epochs 1] [--out models/e5-hakuba]`
Reports recall@1 / MRR@10 on the dev split (entries never seen in training) before and after,
and logs both to MLflow.
"""

import argparse
from pathlib import Path

import numpy as np
from datasets import Dataset
from hakuba_api.places.suggest import load_index
from sentence_transformers import (
    SentenceTransformer,
    SentenceTransformerTrainer,
    SentenceTransformerTrainingArguments,
)
from sentence_transformers.losses import MultipleNegativesRankingLoss
from sentence_transformers.training_args import BatchSamplers

from hakuba_search.embed import BASE_MODEL, PASSAGE, QUERY, device, entry_text
from hakuba_search.synth import Pair, make_pairs

ROOT = Path(__file__).parents[2]


def dev_scores(model: SentenceTransformer, dev: list[Pair], texts: dict[str, str]) -> dict:
    """Retrieve each dev query against the WHOLE index (train entries are distractors)."""
    ids = list(texts)
    docs = model.encode([PASSAGE + texts[i] for i in ids], normalize_embeddings=True)
    qs = model.encode([QUERY + p.query for p in dev], normalize_embeddings=True)
    order = np.argsort(-(qs @ docs.T), axis=1)[:, :10]
    ranks = [
        next((r for r, j in enumerate(row) if ids[j] == p.entry_id), None)
        for row, p in zip(order, dev, strict=True)
    ]
    return {
        "dev_recall1": float(np.mean([r == 0 for r in ranks])),
        "dev_mrr10": float(np.mean([1 / (r + 1) if r is not None else 0 for r in ranks])),
    }


def main() -> None:
    import mlflow

    parser = argparse.ArgumentParser()
    parser.add_argument("--epochs", type=int, default=1)
    parser.add_argument("--batch", type=int, default=32)
    parser.add_argument("--lr", type=float, default=2e-5)
    parser.add_argument("--out", default=str(ROOT / "models" / "e5-hakuba"))
    args = parser.parse_args()

    entries = load_index()
    texts = {e.id: entry_text(e) for e in entries}
    pairs = make_pairs(entries)
    print(f"pairs: train {len(pairs['train'])}, dev {len(pairs['dev'])}")

    model = SentenceTransformer(BASE_MODEL, device=device())
    before = dev_scores(model, pairs["dev"], texts)
    print("before", before)

    train = Dataset.from_dict(
        {
            "anchor": [QUERY + p.query for p in pairs["train"]],
            "positive": [PASSAGE + texts[p.entry_id] for p in pairs["train"]],
        }
    )
    targs = SentenceTransformerTrainingArguments(
        output_dir=str(ROOT / "out" / "train"),
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch,
        learning_rate=args.lr,
        warmup_ratio=0.1,
        # two queries for the same entry in one batch would be scored as negatives
        batch_sampler=BatchSamplers.NO_DUPLICATES,
        logging_steps=20,
        save_strategy="no",
        report_to="none",
        seed=0,
    )
    trainer = SentenceTransformerTrainer(
        model=model,
        args=targs,
        train_dataset=train,
        loss=MultipleNegativesRankingLoss(model),
    )
    result = trainer.train()
    after = dev_scores(model, pairs["dev"], texts)
    print("after", after, "train_loss", round(result.training_loss, 4))
    model.save(args.out)

    mlflow.set_tracking_uri(f"sqlite:///{ROOT / 'mlflow.db'}")
    mlflow.set_experiment("place-search-finetune")
    with mlflow.start_run(run_name=Path(args.out).name):
        mlflow.log_params(vars(args) | {"base": BASE_MODEL, "train_pairs": len(pairs["train"])})
        mlflow.log_metrics({f"before_{k}": v for k, v in before.items()})
        mlflow.log_metrics({f"after_{k}": v for k, v in after.items()})
        mlflow.log_metric("train_loss", result.training_loss)


if __name__ == "__main__":
    main()
