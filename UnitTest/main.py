import unittest
from selenium import webdriver
from selenium.webdriver.common.keys import Keys
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
import HtmlTestRunner
import time

from utils import login

class StoreSystemTest(unittest.TestCase):
    @classmethod
    def setUp(self):
        chrome_service = Service(ChromeDriverManager().install())
        self.driver = webdriver.Chrome(service=chrome_service)
        self.driver.implicitly_wait(10)
        self.driver.maximize_window()
        self.url = "http://localhost:5173/"

        self.driver.get(self.url)
        time.sleep(2)
        login(self.driver)
        time.sleep(2)


    def test_A_product_filter(self):
        driver = self.driver
        driver.find_element(By.XPATH, "//a[@href='/bills']").click()
        time.sleep(2)
        driver.find_element(By.ID, "showExpandedBillSwitch").click()
        time.sleep(2)
        driver.find_element("xpath", "//td[contains(text(), 'Product A')]")

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
            driver.find_element("xpath", "//td[contains(text(), 'Product A')]")
            assert False, "Bill with product meds should not be present"
        except:
            pass

        product_dropdown.click()
        time.sleep(2)
        product_dropdown.send_keys(Keys.ARROW_DOWN)
        time.sleep(2)
        product_dropdown.send_keys(Keys.ENTER)
        time.sleep(2)
        driver.find_element("xpath", "//td[contains(text(), 'Product A')]")

        time.sleep(2)

    def test_B_add_employee(self):
        driver = self.driver
        driver.find_element(By.XPATH, "//a[@href='/employees']").click()
        time.sleep(2)
        driver.find_element(By.ID, "addEmployeeBtn").click()
        time.sleep(2)

        driver.find_element(By.ID, "employeeNameField").send_keys("Test Employee")
        time.sleep(2)

        driver.find_element(By.ID, "employeNumberField").send_keys("9876543210")
        time.sleep(2)

        driver.find_element(By.ID, "employeeAddressField").send_keys("Test Address")
        time.sleep(2)

        driver.find_element(By.ID, "employeeSalaryField").send_keys("2000")
        time.sleep(2)

        driver.find_element(By.ID, "employeeAddSubmitBtn").click()
        time.sleep(2)

        try:
            driver.find_element("xpath", "//td[contains(text(), 'Test Employee')]")
        except:
            assert False, "Add employee not working"

    
    def test_C_edit_employee(self):
        driver = self.driver
        driver.find_element(By.XPATH, "//a[@href='/employees']").click()
        time.sleep(2)

        employeeEditBtns =  driver.find_elements(By.CLASS_NAME, "employeeEditBtn")
        employeeEditBtns[-1].click()
        time.sleep(2)

        driver.find_element(By.ID, "employeeNameField").clear()
        time.sleep(2)
        driver.find_element(By.ID, "employeeNameField").send_keys("Test Employee Updated")
        time.sleep(2)

        driver.find_element(By.ID, "employeeAddSubmitBtn").click()
        time.sleep(2)

        try:
            driver.find_element("xpath", "//td[contains(text(), 'Test Employee Updated')]")
        except:
            assert False, "Update employee not working"


    def test_D_delete_employee(self):
        driver = self.driver
        driver.find_element(By.XPATH, "//a[@href='/employees']").click()
        time.sleep(2)

        employeeDelBtns =  driver.find_elements(By.CLASS_NAME, "employeeDelBtn")
        employeeDelBtns[-1].click()
        time.sleep(2)

        driver.find_element(By.ID, "employeeDelConfirmBtn").click()
        time.sleep(2)

        try:
            driver.find_element("xpath", "//td[contains(text(), 'Test Employee Updated')]")
            assert False, "Delete employee not working"
        except:
            pass

    @classmethod
    def tearDown(self):
        self.driver.quit()

if __name__ == "__main__":
    unittest.main(testRunner=HtmlTestRunner.HTMLTestRunner(output='reports'), verbosity=2)
