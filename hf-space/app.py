"""
Hugging Face Spaces entry point (Gradio SDK, free tier).

Docker Spaces are paid, so this file runs the existing FastAPI app from
main.py on the Gradio SDK instead. The API is unchanged:
    GET  /hello
    POST /predict
A small Gradio page is mounted at "/" so the Space has a landing page.
"""
import gradio as gr
import uvicorn

from main import app  # the FastAPI app with /hello and /predict

with gr.Blocks(title="MindScope API") as info_page:
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

# Routes defined in main.py are registered first, so they take priority
# over the Gradio page mounted at the root.
app = gr.mount_gradio_app(app, info_page, path="/")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=7860)
