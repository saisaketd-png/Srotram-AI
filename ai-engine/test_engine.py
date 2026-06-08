import requests
import numpy as np

dummy_pcm = np.random.randn(500).astype(np.float32).tobytes()

resp = requests.post("http://localhost:8000/analyze", data=dummy_pcm)
print("Status Code:", resp.status_code)
print("Text:", resp.text)
