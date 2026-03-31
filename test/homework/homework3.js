import { browser, expect, $ } from '@wdio/globals'
import SalariesPage from "../pages/salaries.page.js"

describe.skip('Dou main page', () => {

    it('Should show salaries page', async () => {
        await browser.url('https://dou.ua')

        await SalariesPage.clickOnSalariesBtn()
        await browser.pause(2000)

        await expect(SalariesPage.kvartilStr).toHaveText('I КВАРТИЛЬ')
        await browser.pause(2000)

        await SalariesPage.clickOnWorkBtn()
        await browser.pause(2000)

        await expect(SalariesPage.searchBtn).toBeDisplayed();
        await SalariesPage.setSearchJobInput("AQA Тестувальник")
        await SalariesPage.searchBtn.click()
        await browser.pause(2000)
    })

})
