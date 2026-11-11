import joblib 
from fastapi import FastAPI
from pydantic import BaseModel, Field
import pandas as pd
from typing import Literal
from fastapi.middleware.cors import CORSMiddleware

model = joblib.load('Mnetal_Health_Model.pkl') #importing data

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"]
)

# PYNDATIC MODEL 

class StudentData(BaseModel):
    Age : int = Field(..., gt=10, le=100, description="Age must be a positive integer")
    Gender : Literal['Male', 'Female']
    Country : str 
    Academic_Level : Literal['Undergraduate', 'Graduate', 'High School']
    Most_Used_Platform : Literal['Facebook', 'LinkedIn', 'Instagram', 'Snapchat', 'Twitter',
       'YouTube', 'TikTok', 'LINE', 'KakaoTalk', 'VKontakte', 'WhatsApp',
       'WeChat']
    Purpose_Of_Use : Literal['Networking', 'Education', 'Entertainment', 'News']
    Avg_Daily_Usage_Hours : float = Field(..., gt=0, le=24, description="Average daily usage hours must be between 0  and 24")   
    Daily_Unlocks : int = Field(..., gt=0, description="Daily unlocks must be a positive integer")  
    Study_Hours : float = Field(..., gt=0, le=24, description="Study hours must be between 0 and 24")
    Physical_Activity_Hours : float = Field(..., gt = 0, le = 24)
    Sleep_Hours_Per_Night : float = Field(..., gt=0, le=24, description="Sleep hours per night must be between 0 and 24")
    Stress_Level : Literal['Low', 'Medium', 'High', 'Very High']




#desribe what we send back

class predictionResponse(BaseModel) :
    predicted_mental_health_score : float = Field(..., description="Predicted mental health score") 
    


@app.get('/hello')
def greet():
    return('hello guys this is me testing FASTAPI')


top_countries = ['Other',
 'India',
 'USA',
 'Canada',
 'Australia',
 'UK',
 'Germany',
 'Turkey',
 'Mexico',
 'France']

@app.post('/predict', response_model=predictionResponse)
def predict(data: StudentData):

    country_group = data.Country if data.Country in top_countries else "Other"

    input_row = pd.DataFrame( [{
        'Age' : data.Age,
        'Gender' : data.Gender,
        'Country' : data.Country,
        'Academic_Level' : data.Academic_Level,
        'Most_Used_Platform' : data.Most_Used_Platform,
        'Purpose_Of_Use' : data.Purpose_Of_Use,
        'Avg_Daily_Usage_Hours' : data.Avg_Daily_Usage_Hours,
        'Daily_Unlocks' : data.Daily_Unlocks,
        'Study_Hours' : data.Study_Hours,
        'Physical_Activity_Hours' : data.Physical_Activity_Hours,
        'Sleep_Hours_Per_Night' : data.Sleep_Hours_Per_Night,
        'Stress_Level' : data.Stress_Level,
        'Grouped Country' : country_group
    }])
   

    prediction = model.predict(input_row)[0]

    return predictionResponse(predicted_mental_health_score=round(float(prediction),2)) 
