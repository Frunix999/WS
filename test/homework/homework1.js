import { browser, expect, $ } from '@wdio/globals'

describe.skip('Sing up on GitHub page', () => {
   it("homework 1", async () => {
        await browser.url(`https://webdriver.io/`)

        let apiLink = await $("//a[contains(@class, 'navbar__item')][@href='/docs/api']")

        await apiLink.click()

        await expect(browser).toHaveUrl('https://webdriver.io/docs/api')
        let browserUrl = await browser.getUrl()
        console.log("Browser url is: " + browserUrl)

        let introductionElement = await $("//h1")
        let text = await introductionElement.getText()

        await expect(introductionElement).toHaveText("Introduction")
        console.log("Introduction value is: " + text)

        let webDriverLink = await $("//a[@href='/docs/api/webdriver']")
        await expect(webDriverLink).toHaveText("WebDriver")

        let searchButton = await $("//span[contains(@class, 'DocSearch-Button-Placeholder')]")
        await searchButton.click()


        let enterSearchEntry = await $("//input[contains(@class, 'DocSearch-Input')]")
        await enterSearchEntry.addValue("All its done")
        await browser.pause(2000)
        await browser.keys(['Control', 'a'])
        await browser.pause(2000)
        await browser.keys('Backspace')
        await browser.pause(2000)


    })

})