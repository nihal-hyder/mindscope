# MindScope

**Student mental health score prediction with machine learning, served by FastAPI and shown in a vanilla HTML/CSS/JS dashboard.**

MindScope takes a student's lifestyle and digital habits (social media use, phone unlocks, study, physical activity, sleep and stress level) and returns a numerical mental health score predicted by a trained scikit-learn model.

> **Disclaimer:** MindScope is an educational machine learning project. Its predictions are estimates and are **not** medical advice, diagnoses or clinical assessments.

---

## Features

- **ML pipeline:** a scikit-learn `Pipeline` with preprocessing and a Random Forest regressor, saved with `joblib`.
- **FastAPI backend:** a `POST /predict` endpoint whose Pydantic schema validates every request before it reaches the model.
- **Frontend in plain HTML, CSS and JavaScript (no framework):**
  - a four-step assessment with sliders, option cards, inline validation and a progress tracker
  - a live API connection indicator
  - an animated results view that shows the exact score the API returns
  - a history of the predictions made in the current browser tab
  - layouts for desktop, tablet and phone
- **Error handling:** clear messages for validation errors (422), server errors, timeouts, an unreachable backend and malformed responses.

## Tech stack

| Layer    | Tools                                       |
|----------|---------------------------------------------|
| Model    | Python, pandas, NumPy, scikit-learn, joblib |
| API      | FastAPI, Pydantic, Uvicorn                  |
| Frontend | HTML5, CSS3, vanilla JavaScript (`fetch`)   |

## Project structure

```
.
├── main.py                                            # FastAPI app (/hello, /predict)
├── Mnetal_Health_Model.pkl                            # Trained scikit-learn pipeline
├── model.ipynb                                        # EDA, preprocessing and model training
├── Student Social Media And Mental Health Impact.csv  # Training dataset
├── requirements.txt
└── mindscope/                                         # Frontend
    ├── index.html
    ├── css/style.css
    ├── js/script.js
    └── assets/logo.svg
```

## The model

The model is trained in `model.ipynb` on `Student Social Media And Mental Health Impact.csv`.

**Preprocessing**
- Duplicate rows are dropped, and negative physical activity values are clipped to 0.
- Countries outside the 10 most common are grouped as `Other` (stored as `Grouped Country`).
- `Study_Hours` is log-transformed (`log1p`), then standardised.
- The other numeric features are standardised with `StandardScaler`.
- `Stress_Level` is ordinal encoded (Low < Medium < High < Very High).
- `Age`, `Gender`, `Most_Used_Platform`, `Academic_Level`, `Purpose_Of_Use` and `Grouped Country` are one-hot encoded, and unseen categories are ignored.

**Estimator:** `RandomForestRegressor` (`random_state=42`), trained on a 70/30 train/test split.

**Target:** `Mental_Health_Score`. The model's scoring scale has not been formally documented, so the frontend shows the raw predicted value without categories or risk levels.

> **Note:** `Age` is one-hot encoded on the ages in the dataset (18–24). Ages outside that range are accepted by the API but contribute nothing to the prediction.

## API reference

Base URL: `http://localhost:2340`

### `GET /hello`
A health check. The frontend uses it for the connection indicator.

### `POST /predict`

**Request body**
```json
{
  "Age": 20,
  "Gender": "Male",
  "Country": "Pakistan",
  "Academic_Level": "Undergraduate",
  "Most_Used_Platform": "Instagram",
  "Purpose_Of_Use": "Entertainment",
  "Avg_Daily_Usage_Hours": 5.5,
  "Daily_Unlocks": 60,
  "Study_Hours": 5,
  "Physical_Activity_Hours": 1.5,
  "Sleep_Hours_Per_Night": 7,
  "Stress_Level": "Medium"
}
```

**Response**
```json
{ "predicted_mental_health_score": 5.47 }
```

**Accepted values**

| Field | Rule |
|---|---|
| `Age` | integer, > 10 and ≤ 100 |
| `Gender` | `Male`, `Female` |
| `Country` | any string (countries outside the top 10 are mapped to `Other`) |
| `Academic_Level` | `High School`, `Undergraduate`, `Graduate` |
| `Most_Used_Platform` | `Facebook`, `LinkedIn`, `Instagram`, `Snapchat`, `Twitter`, `YouTube`, `TikTok`, `LINE`, `KakaoTalk`, `VKontakte`, `WhatsApp`, `WeChat` |
| `Purpose_Of_Use` | `Networking`, `Education`, `Entertainment`, `News` |
| `Avg_Daily_Usage_Hours` | number, > 0 and ≤ 24 |
| `Daily_Unlocks` | integer, > 0 |
| `Study_Hours` | number, > 0 and ≤ 24 |
| `Physical_Activity_Hours` | number, > 0 and ≤ 24 |
| `Sleep_Hours_Per_Night` | number, > 0 and ≤ 24 |
| `Stress_Level` | `Low`, `Medium`, `High`, `Very High` |

Invalid input returns **HTTP 422** with FastAPI's standard `detail` array. Interactive docs are available at `http://localhost:2340/docs` while the server is running.

## Getting started

### 1. Install dependencies
```bash
pip install -r requirements.txt
```
The model was trained with scikit-learn 1.7.2. Loading the `.pkl` with a very different scikit-learn version may produce warnings or errors.

### 2. Start the backend
From the project root (where `main.py` and the `.pkl` file are):
```bash
uvicorn main:app --port 2340 --reload
```

### 3. Start the frontend
Choose one:
- In VS Code, open the `mindscope/` folder, right-click `index.html` and choose **Open with Live Server**.
- Or serve the folder with Python and open http://localhost:5500:
  ```bash
  python -m http.server 5500 --directory mindscope
  ```

The status pill in the navigation bar should show **API connected**.

### 4. Try it
1. Click **Start Assessment** and complete the four steps.
2. Click **Generate Prediction** to see the score returned by the model.
3. Use **Adjust inputs** to change answers and compare runs in the session history.

You can also call the API directly:
```bash
curl -X POST http://localhost:2340/predict \
  -H "Content-Type: application/json" \
  -d '{"Age":20,"Gender":"Male","Country":"Pakistan","Academic_Level":"Undergraduate","Most_Used_Platform":"Instagram","Purpose_Of_Use":"Entertainment","Avg_Daily_Usage_Hours":5.5,"Daily_Unlocks":60,"Study_Hours":5,"Physical_Activity_Hours":1.5,"Sleep_Hours_Per_Night":7,"Stress_Level":"Medium"}'
```

## Configuration

The frontend's API address is set at the top of `mindscope/js/script.js`:
```js
const API_BASE = "http://localhost:2340";
```
The backend allows all CORS origins (`allow_origins=["*"]`), which is fine for local development. Restrict it before deploying anywhere public.

## Limitations

- The score is a model estimate learned from one survey dataset and has no clinical meaning.
- The scoring scale and its interpretation have not been documented or validated.
- Ages outside 18–24 do not influence the prediction (see the note under [The model](#the-model)).

## Disclaimer

This project is for learning and demonstration only. It cannot diagnose or evaluate anyone's mental health. If you are struggling, please contact a qualified professional or your local support services.
