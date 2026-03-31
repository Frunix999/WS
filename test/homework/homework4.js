import { browser, expect, $ } from '@wdio/globals'
import GitPage from "../pages/gitMain.page.js"

describe('GitHub registration', () => {
    xit('Should show salaries page', async () => {
    await browser.url('https://github.com/')

    await GitPage.loginBtn.click()

    await GitPage.setUsernameInput("qa_tester@gmail.com")

    await GitPage.setPasswordInput("SuperSecretPassword!")

    await GitPage.setLoginInput("aqa_t")

    await GitPage.setClickBtn()
    await browser.pause(4000)
    })

    xit('should show string on main page', async () =>{
        await browser.url('https://github.com/')

        await GitPage.waitForStrScroll()

        await expect(GitPage.tryGitHubBtn).toBeDisplayed();

        await GitPage.tryGitHubBtn.click()


        await expect(GitPage.getStr2).toBeDisplayed();

        await GitPage.submitBtn.click()

        await browser.pause(2000)
    })

    xit('should show subscribe button on main page', async () =>{
        await browser.url('https://github.com/')

        await GitPage.subscribeBtnScroll()

        await GitPage.subscribeBtn.click()

        await expect(GitPage.checkSubscribeStr).toBeDisplayed();

        await GitPage.setEmailInput("qa_tester@gmail.com")

        await GitPage.countrySelect.click()

        await GitPage.countrySelect.selectByVisibleText('Ukraine');

        await GitPage.clickNewsletterCheckbox()

        await GitPage.clickFinalSubscribeBtn()

        await expect(GitPage.finalStr).toBeDisplayed();
        await browser.pause(2000)
    })

    xit('Use GitHub search module', async () => {
        await browser.url("https://github.com/")

        await GitPage.searchField.click()
        await browser.pause(2000)

        await GitPage.setModalSearch("php")
        await browser.pause(2000)

        await GitPage.searchAllBtn.click()
        await browser.pause(2000)

        await expect(GitPage.phpSearchResult).toBeDisplayed();
        await browser.pause(2000)
    })

    it('Use GitHub price', async () => {
        await browser.url("https://github.com/")

        await GitPage.pricingLink.click()
        await browser.pause(2000)

        await GitPage.scrollToCompareStr()
        await GitPage.compareStrLink.click()
        await browser.pause(2000)

        await expect(GitPage.compareFeatures).toBeDisplayed();
        await browser.pause(2000)

    })
})