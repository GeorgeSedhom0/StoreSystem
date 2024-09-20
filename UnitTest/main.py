import unittest
from selenium import webdriver
from selenium.webdriver.common.keys import Keys
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
import HtmlTestRunner
import time

class StoreSystemTest(unittest.TestCase):
    @classmethod
    def setUpClass(self):
        chrome_service = Service(ChromeDriverManager().install())
        self.driver = webdriver.Chrome(service=chrome_service)
        self.driver.implicitly_wait(10)
        self.driver.maximize_window()
        self.url = "http://localhost:5173/"

    @classmethod
    def test_product_filter(self):
        driver = self.driver
        driver.get(self.url)

        time.sleep(2)

        driver.find_element(By.ID, "loginUserName").send_keys("george")
        time.sleep(2)
        driver.find_element(By.ID, "loginPassword").send_keys("verystrongpassword")
        time.sleep(2)
        driver.find_element(By.ID, "loginBtn").click()
        time.sleep(2)
        driver.find_element(By.XPATH, "//a[@href='/bills']").click()
        time.sleep(2)
        driver.find_element(By.ID, "showExpandedBillSwitch").click()
        time.sleep(2)
        driver.find_element("xpath", "//td[contains(text(), 'Meds')]")

        time.sleep(2)
        product_dropdown = driver.find_element(By.ID,"selectProductDropdown")

        product_dropdown.click()
        time.sleep(2)
        product_dropdown.send_keys(Keys.ARROW_DOWN)
        time.sleep(2)
        product_dropdown.send_keys(Keys.ARROW_DOWN)
        time.sleep(2)
        product_dropdown.send_keys(Keys.ENTER)
        time.sleep(2)
        product_dropdown.send_keys(Keys.TAB)


        try:
            driver.find_element("xpath", "//td[contains(text(), 'Meds')]")
            assert False, "Bill with product meds should not be present"
        except:
            pass

        product_dropdown.click()
        time.sleep(2)
        product_dropdown.send_keys(Keys.ARROW_DOWN)
        time.sleep(2)
        product_dropdown.send_keys(Keys.ENTER)
        time.sleep(2)
        driver.find_element("xpath", "//td[contains(text(), 'Meds')]")

        time.sleep(2)


        
    @classmethod
    def tearDownClass(self):
        self.driver.quit()

if __name__ == "__main__":
    unittest.main(testRunner=HtmlTestRunner.HTMLTestRunner(output='reports'), verbosity=2)
