"""
Hugging Face Spaces entry point (Gradio SDK, free tier).

Docker Spaces are paid, so the existing FastAPI endpoints from main.py are
served through Gradio's own server instead. On Spaces the platform expects
the app to start via `demo.launch()`, which manages the port itself, so we
don't run uvicorn directly.

The API is unchanged:
    GET  /hello
    POST /predict
    /docs  (interactive API documentation)
A small Gradio page is shown at "/".
"""

# ZeroGPU hardware refuses to start unless at least one function is
# decorated with @spaces.GPU. The model runs on CPU, so this placeholder is
# never called. On CPU hardware or locally `spaces` may be missing; skip it.
try:
    import spaces

    @spaces.GPU
    def _zerogpu_placeholder():
        return None
except ImportError:
    pass

import gradio as gr
from fastapi.middleware.cors import CORSMiddleware
from fastapi.routing import APIRoute
from starlette.middleware import Middleware

import main  # FastAPI app, Pydantic schema and the loaded model

# Reuse the exact route definitions (validation + response model) from main.py.
api_routes = [route for route in main.app.routes if isinstance(route, APIRoute)]

with gr.Blocks(title="MindScope API") as demo:
    gr.Markdown(
        """
        # MindScope API
        This Space hosts the prediction API for the MindScope project.

        - `GET /hello` — health check
        - `POST /predict` — returns `predicted_mental_health_score`
        - `/docs` — interactive API documentation

        Educational project. Predictions are machine learning estimates,
        not clinical assessments.
        """
    )

if __name__ == "__main__":
    demo.launch(
        server_name="0.0.0.0",
        app_kwargs={
            # Registered before Gradio's own routes, so they take priority.
            "routes": api_routes,
            # Same CORS policy as main.py, so the Vercel frontend can call the API.
            "middleware": [
                Middleware(
                    CORSMiddleware,
                    allow_origins=["*"],
                    allow_methods=["*"],
                    allow_headers=["*"],
                )
            ],
            "docs_url": "/docs",
        },
    )
