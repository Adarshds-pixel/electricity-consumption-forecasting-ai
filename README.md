⚡ Electricity Consumption Forecasting (LSTM + AI Insights)
📌 Overview

This project is an AI-powered electricity consumption forecasting system that predicts future energy usage using LSTM (Long Short-Term Memory) networks and provides cost analysis, safety insights, and intelligent recommendations.

It combines Machine Learning + Full Stack Development to deliver real-time forecasting with an interactive dashboard.

🚀 Features

🔮 Time Series Forecasting using LSTM

📊 Interactive Graphs & Seasonal Trends

⚠️ Load Forecast Alerts (High/Normal)

💡 Smart Energy Saving Recommendations

💰 Cost Estimation based on tariff

🏠 Hybrid Profiles (Household / Apartment / Industrial)

📋 Forecast Usage Table with status labels

📈 Downloadable graphs & CSV reports

🛠 Tech Stack

Programming: Python

ML/DL: TensorFlow, LSTM

Libraries: NumPy, Pandas, Matplotlib, Scikit-learn

Backend: Flask

Frontend: HTML, CSS, JavaScript

Visualization: Chart.js

📂 Project Structure
electricity-forecasting-project/
│── backend/
│   ├── train_model.py
│   ├── evaluate_model.py
│   ├── model_utils.py
│   ├── app.py
│   ├── requirements.txt
│   ├── saved_models/
│
│── data/
│   ├── apartment_1998_2018.csv
│   ├── household_1998_2018.csv
│   ├── industrial_1998_2018.csv
│
│── frontend/
│   ├── index.html
│   ├── script.js
│   ├── style.css
│
│── assets/
│── README.md
⚙️ How It Works

Data Input: User uploads CSV with DateTime & consumption data

Preprocessing: Data is normalized using MinMaxScaler

Sequence Creation: Sliding window (last 30 readings)

Model Training: LSTM learns temporal patterns

Prediction: Forecasts future electricity usage

Insights Engine:

Load severity detection

Cost estimation

Safety recommendations

Visualization: Graphs, tables, seasonal trends
