---
title: MindScope API
emoji: 🧠
colorFrom: gray
colorTo: yellow
sdk: gradio
sdk_version: 6.31.0
python_version: "3.10"
app_file: app.py
pinned: false
---

# MindScope API

FastAPI backend for MindScope, a student mental health score predictor.

- `GET /hello` — health check
- `POST /predict` — returns `{"predicted_mental_health_score": <float>}`
- `/docs` — interactive API docs

Educational project. Predictions are machine learning estimates, not clinical assessments.
