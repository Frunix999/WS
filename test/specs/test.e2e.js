import { browser, expect, $ } from '@wdio/globals'
import LoginPage from "../pages/login.page.js"
import MainPage from '../pages/main.page.js'
import GameDevPage from "../pages/gameDev.page.js"

describe.skip('Webdriverio main page', () => {
   xit('should have correct tittle', async () => {
        await browser.url('https://webdriver.io')

        const title = await browser.getTitle()
        console.log(title)

        await expect(browser).toHaveTitle('WebdriverIO · Next-gen browser and mobile automation test framework for Node.js | WebdriverIO')
    })
    xit('should show addValue command', async () => {
        await browser.url(`https://the-internet.herokuapp.com/login`)

        let input = await $("#username")
        await input.addValue("Hello")
        await browser.pause(2000)

        await input.addValue(123)
        await browser.pause(2000)

        await expect(input).toHaveValue("Hello123")
    })

    xit('should show setValue command', async () => {
            await browser.url(`https://the-internet.herokuapp.com/login`)

            let input = await $("#username")
            await input.setValue("world")
            await input.setValue("hello")

            console.log(await input.getValue())
            await expect(input).toHaveValue("hello")
            
        })

    xit('should show click command', async () =>{
        await browser.url(`https://the-internet.herokuapp.com/login`)

        let loginButton = await $('.radius')
        await browser.pause(2000)
        await loginButton.click()

        let inputUsername = await $('#username')
        await inputUsername.addValue("tomsmith")
        await browser.pause(2000)

        let inputPassword = await $("#password")
        await inputPassword.addValue("SuperSecretPassword!")
        await browser.pause(2000)

        await loginButton.click()
        await browser.pause(4000)
    })

    xit("should show getAttribute command", async () => {
        await browser.url(`https://dou.ua/`)

        let inputSearch = await $('#txtGlobalSearch')
        let attr = await inputSearch.getAttribute("placeholder")
        console.log("Placeholder attribute is: " + attr)

        await inputSearch.setValue("Cat")
        attr = await inputSearch.getValue()
        await browser.pause(2000)
        console.log("Value attribute is: " + attr)
    })

    xit("should show get location command", async () => {
        await browser.url(`https://dou.ua/`)
        let inputSearch = await $('#txtGlobalSearch')
        let location = await inputSearch.getLocation()
        console.log("Location is: " + location)

        let xLocation = await inputSearch.getLocation("x")
        console.log("Location by x: " + xLocation)

    })

    xit("should show getText command", async () => {
        await browser.url(`https://webdriver.io/`)

        let subtitle = await $('.hero__subtitle')
        console.log("Subtitle text is: " + await subtitle.getText())
    })


    xit("should show if an element is clickable", async () => {
            await browser.url('https://webdriver.io')

            const blogButton = await $('.button[href="/docs/gettingstarted"]')
            let clickable = await blogButton.isClickable()
            
            console.log("Is clickable: " + clickable)
        })

    xit("should show if an element is displayed", async () => {
        await browser.url('https://webdriver.io')

        const blogButton = await $('.button[href="/docs/gettingstarted"]')
        let displayed = await blogButton.isDisplayed()
        
        console.log("Is displayed: " + displayed)
    })

    xit("should show if an element is visible", async () => {
        await browser.url('https://webdriver.io')

        const blogButton = await $('.button[href="/docs/gettingstarted"]')
        
        await expect(blogButton).toBeDisplayedInViewport()
        console.log("Blog button is visible in viewport!")

        const footer = await $('.footer__link-item[href="/docs/gettingstarted"]')
        
        await expect(footer).not.toBeDisplayedInViewport()
        console.log("Footer is NOT visible in viewport yet.")
    })
    xit("should show if an element is enabled", async () => {
    await browser.url('https://webdriver.io')

    const getStartedButton = await $('.button[href="/docs/gettingstarted"]')
    let isEnabled = await getStartedButton.isEnabled()
    
    console.log("Is get started button enabled: " + isEnabled) // outputs: true
    })

    xit("should show if an element is focused", async () => {
        await browser.url('https://webdriver.io')

        const getStartedButton = await $('.button[href="/docs/gettingstarted"]')
        
        let isFocused = await getStartedButton.isFocused()
        console.log("Is get started button focused before click: " + isFocused) // outputs: false
        
        await browser.pause(2000)
        await getStartedButton.click()
        
        isFocused = await getStartedButton.isFocused()
        console.log("Is get started button focused after click: " + isFocused) // outputs: true
        
        await browser.pause(2000)
    })
    xit("should show movement to element action", async () => {
    await browser.url('https://webdriver.io')

    const getStartedLink = await $('.footer__link-item[href="/docs/gettingstarted"]')
    
    await browser.pause(2000)
    
    await getStartedLink.scrollIntoView()
    
    await browser.pause(2000)
    })
    xit("should show save screenshot command", async () => {
    await browser.url('https://webdriver.io')

    const getStartedLink = await $('.footer__link-item[href="/docs/gettingstarted"]')
    
    await browser.pause(2000)
    await getStartedLink.scrollIntoView()
    await browser.pause(2000)
    
    await getStartedLink.saveScreenshot('linkScreenshot.png')
    })

    xit("should switch to another window", async () => {
        await browser.url('https://webdriver.io')

        await browser.newWindow('https://google.com')
        await browser.pause(2000)

        await browser.switchWindow('https://webdriver.io')
        await browser.pause(2000)
    })
    xit("should show waitUntil command", async () => {
    await browser.url('https://webdriver.io')

    await browser.waitUntil(async () => {
        return (await $('.button[href="/docs/gettingstarted"]').isDisplayed())
    }, {
        timeout: 5000,
        timeoutMsg: 'Button is not displayed'
    })
    })

    xit("should get html for certain elements", async () => {
        await browser.url('https://webdriver.io')

        const outerHTML = await $('.dropdown__menu').getHTML()
        console.log("outerHTML : " + outerHTML)

        const innerHTML = await $('.dropdown__menu').getHTML(false)
        console.log("innerHTML : " + innerHTML)
    })
    xit("homework 2", async () => {
        await browser.url(`https://webdriver.io/`)

        let apiLink = await $("//a[contains(@class, 'navbar__item')][@href='/docs/api']")
        await apiLink.click()
        await expect(browser).toHaveUrl('https://webdriver.io/docs/api')
        let browserUrl = await browser.getUrl()
        console.log("Browser url is: " + browserUrl)

        let apiReferenceLink = await $(`//a[contains(@class, 'footer__link-item')][@href='/docs/api']`)
        await apiReferenceLink.scrollIntoView()

        let link = await $(`//a[contains(@class, 'footer__link-item')][@href='/blog']`)
        await link.isDisplayed()
        let buttonLink = await $(`//a[contains(@class, 'pagination-nav__link pagination-nav__link--next')][@href='/docs/api/protocols']`)
        await buttonLink.isDisplayed()
        await buttonLink.isClickable()
        await buttonLink.getHTML()
        await buttonLink.click()

        let protocolLink = await $(`//h2[text()='WebDriver Protocol']`)
        await protocolLink.waitUntil(async function () {
        return (await this.getText()) === 'WebDriver Protocol'
        }, {
            timeout: 5000,
            timeoutMsg: 'expected text to be different after 5s'
        })
            await browser.pause(2000)
        })

    xit("should get html for certain elements", async () => {
        await browser.url('https://webdriver.io')

        const outerHTML = await $('.dropdown__menu').getHTML()
        console.log("outerHTML : " + outerHTML)

        const innerHTML = await $('.dropdown__menu').getHTML(false)
        console.log("innerHTML : " + innerHTML)
    })
    
    xit("should login", async () => {

    await browser.url('https://the-internet.herokuapp.com/login')

    await LoginPage.setUsernameInput("tomsmith")

    await LoginPage.password.addValue("SuperSecretPassword!")

    await LoginPage.loginButton.click()
    await browser.pause(4000)
    })

    xit("should refresh until GameDev button appears", async () => {
    await browser.url('https://dou.ua')

    await MainPage.clickOnBandBtn()
    await MainPage.clickOnForumBtn()

    let isButtonVisible = await MainPage.gameDevBtn.isDisplayed()
    let attempts = 0
    const maxAttempts = 10
    while (!isButtonVisible && attempts < maxAttempts) {
        console.log(`Попытка ${attempts + 1}: Button not found, refreshing...`)
        await browser.refresh()
        
        await browser.pause(1000) 
        
        isButtonVisible = await MainPage.gameDevBtn.isDisplayed()
        attempts++
    }

    await expect(MainPage.gameDevBtn).toBeDisplayed({
        message: `Button GameDev not found after ${maxAttempts} refreshing`
    })

    await MainPage.clickOnGameDevBtn()
    await expect(GameDevPage.companyGameDevsRateLink).toBeClickable()
    })
})

    