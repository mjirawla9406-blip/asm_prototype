
import urllib.request
import json

def test_api():
    try:
        # Check an existing result
        scan_id = "f61b561c"
        url = f"http://localhost:8000/api/analysis/{scan_id}"
        print(f"Fetching {url}")
        with urllib.request.urlopen(url) as response:
            if response.getcode() == 200:
                data = json.loads(response.read().decode())
                pc_data = data.get('point_cloud_data', {})
                print("Keys in point_cloud_data:", pc_data.keys())
                if 'set_colors' in pc_data:
                    print("SUCCESS: API returned set_colors")
                    # print first 5
                    print("First 5 set_colors:", pc_data['set_colors'][:5])
                else:
                    print("FAILURE: API did NOT return set_colors")
            else:
                print(f"API Error: {response.getcode()}")
    except Exception as e:
        print(f"Request failed: {e}")

if __name__ == "__main__":
    test_api()
