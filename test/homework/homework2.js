import { browser, expect, $ } from '@wdio/globals'

describe.skip('Sing up on GitHub page', () => {
   xit('click GitHub sing up button', async () => {
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

    it('Use GitHub search module', async () => {
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

})