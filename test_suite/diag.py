import urllib.request, json, numpy as np, time

sr = 16000

# Test 1: Perfect sine = AI-like (robotically regular pitch)
t = np.linspace(0, 1.5, sr * 3 // 2, dtype=np.float32)
sine = (np.sin(2 * np.pi * 200 * t) * 0.3).astype(np.float32)
req = urllib.request.Request('http://localhost:8000/analyze', data=sine.tobytes(), method='POST')
req.add_header('X-Sample-Rate', '16000')
req.add_header('Content-Type', 'application/octet-stream')
res = json.loads(urllib.request.urlopen(req, timeout=10).read())
print("=== SINE WAVE (should be HIGH risk) ===")
print("risk:", res['risk_score'], "acoustic:", res['acoustic_score'], "behavioral:", res['behavioral_score'])
print("xai:", res['xai_report'][:120])

time.sleep(0.5)

# Test 2: Variable-pitch multi-tone = real-voice-like
t2 = np.linspace(0, 1.5, sr * 3 // 2, dtype=np.float32)
multi = (np.sin(2*np.pi*120*t2) + np.sin(2*np.pi*240*t2*1.03) + np.random.randn(len(t2))*0.02).astype(np.float32)
multi = (multi / np.max(np.abs(multi)) * 0.25).astype(np.float32)
req2 = urllib.request.Request('http://localhost:8000/analyze', data=multi.tobytes(), method='POST')
req2.add_header('X-Sample-Rate', '16000')
req2.add_header('Content-Type', 'application/octet-stream')
res2 = json.loads(urllib.request.urlopen(req2, timeout=10).read())
print("\n=== NOISY MULTI-TONE (should be LOWER risk) ===")
print("risk:", res2['risk_score'], "acoustic:", res2['acoustic_score'], "behavioral:", res2['behavioral_score'])
print("xai:", res2['xai_report'][:120])
