# Backend image for Hugging Face Spaces (Docker SDK).
# Python 3.10 matches the environment the model was trained in.
FROM python:3.10-slim

# Hugging Face runs containers as a non-root user with UID 1000
RUN useradd -m -u 1000 user
USER user
ENV PATH="/home/user/.local/bin:$PATH"
WORKDIR /home/user/app

COPY --chown=user requirements.txt .
RUN pip install --no-cache-dir --upgrade -r requirements.txt

COPY --chown=user main.py Mnetal_Health_Model.pkl ./

# Hugging Face Spaces expects the app on port 7860
EXPOSE 7860
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]
