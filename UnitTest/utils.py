from selenium.webdriver.common.by import By
import time


def login(driver):
    driver.find_element(By.ID, "loginUserName").send_keys("george")
    time.sleep(2)

    driver.find_element(By.ID, "loginPassword").send_keys("verystrongpassword")
    time.sleep(2)

    driver.find_element(By.ID, "loginBtn").click()
    time.sleep(2)