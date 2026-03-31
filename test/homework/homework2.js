import { browser, expect, $ } from '@wdio/globals'

describe('Testing GitHub', () => {
   xit('TC1', async () => {
    await browser.url("https://github.com/")
    const singupField = await $("//input[contains(@class, 'Primer_Brand__TextInput-module__TextInput___EtKj3 TextInput Primer_Brand__TextInput-module__TextInput--medium___kJrew CtaFormControl-input')][1]")
    await singupField.addValue("testEmail@gmail.com")

    await expect(singupField).toHaveValue("testEmail@gmail.com")
    await browser.pause(2000)

    const singUpButton = await $("//button[contains(@class, 'Primer_Brand__Button-module__Button___lDruK Primer_Brand__Button-module__Button--primary___xIC7G Primer_Brand__Button-module__Button--size-medium___EyCyw CtaForm-primaryAction CtaFormControl-button js-hero-action')]")
    await  singUpButton.click()
    await browser.pause(2000)

    let creatMessage = await $(`//h1[text()='Create your free account']`)
    await creatMessage.waitUntil(async function () {
    return (await this.getText()) === 'Create your free account'
    }, {
        timeout: 5000,
        timeoutMsg: 'expected text to be different after 5s'
    })
        await browser.pause(2000)
    })

    xit('TC2', async () => {
        await browser.url("https://github.com/")
        const searchField = await $("//span[contains(@data-target, 'qbsearch-input.inputButtonText')]")
        await searchField.click()
        await browser.pause(2000)

        const moadlSearchField = await $("#query-builder-test")
        await moadlSearchField.addValue("Car")
        await browser.pause(2000)

        const searchAllBtn = await $("//span[text()='Search all of GitHub']")
        await searchAllBtn.click()
        await browser.pause(2000)

        await expect(browser).toHaveUrl(expect.stringContaining('Car'));
        await browser.pause(2000)
    })

    xit('TC3', async () => {
        await browser.url("https://github.com/login")

        const loginField = await $("#login_field")
        const emailField = await $ ("#password")
        const singInBtn = await $("//input[@class='btn btn-primary btn-block js-sign-in-button']")
        const errorMsg = await $("//div[@class='js-flash-alert' and contains(., 'Incorrect username or password.')]")

        await loginField.addValue("testEmail@gmail.com")
        await emailField.addValue("SuperSecretPassword!")

        await singInBtn.click()

        await expect(errorMsg).toHaveText("Incorrect username or password.")

        await browser.pause(2000)
    })

    xit('TC4', async () => {
        await browser.url("https://github.com/search?q=Car&type=repositories")

        const sortBtn = await $("#_r_18_")
        const mostStars = await $("#_r_24_--label")

        await sortBtn.click()

        await mostStars.click()
        

        await browser.pause(2000)
    })

    it('TC5', async () => {
        await browser.url("https://github.com/search?q=Car&type=repositories")

        const repoLink = await $("//a[@href='/mitre-attack/car']")

        await repoLink.click()

        await expect(browser).toHaveUrl('https://github.com/mitre-attack/car');

        await browser.pause(2000)
    })
})