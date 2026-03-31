import { $ } from '@wdio/globals'

class GitPage {
   
    get loginBtn() { return $("//a[contains(@class, 'HeaderMenu-link--sign-up')]") }
    get username() { return $('#email') }
    get password() { return $('#password') }
    get login() { return $('#login') }
    get createBtn() { return $("//button[@data-target='signup-form.SignupButton']") }
    get getStr() {return $("//h2[text()='Millions of developers and businesses call GitHub home']")}
    get tryGitHubBtn() {return $("(//span[text()='Try GitHub Copilot free'])[2]")}
    get getStr2() {return $("//h1[contains(@class, 'text-center')]")}
    get submitBtn() {return $("//button[@type='submit' and contains(., 'Try now')]")}
    get subscribeBtn() {return $(`a[href="https://github.com/newsletter"]`)}
    get checkSubscribeStr() {return $("//h1[text()='Get our developer newsletter']")}
    get emailInput() {return $("#form-field-emailAddress")}
    get countrySelect() {return $("#form-field-country")}
    get checkBox() {return $(".Primer_Brand__Checkbox-module__Checkbox___T8FJa")}
    get finalSubscribeBtn() {return $("//button[contains(., 'Subscribe')]")}
    get finalStr() {return $("//h1[text()='Thanks for subscribing']")}
    get searchField() {return $("//span[contains(@data-target, 'qbsearch-input.inputButtonText')]")}
    get moadlSearchField() {return $("#query-builder-test")}
    get searchAllBtn() {return $("//span[text()='Search all of GitHub']")}
    get phpSearchResult() {return $("//a[contains(@href, '/docker-library/php') and .//em[text()='php']]")}
    get pricingLink() {return $("//span[text()='Pricing']")}
    get tryCopStr() {return $("//h1[text()='Try the Copilot-powered platform']")}
    get compareStrLink() {return $("//a[@href='#compare-features']")}
    get compareFeatures() {return $("//h1[text()='Compare features']")}


    async clickOnLoginBtn() {
        await this.loginBtn.click()
    }
        async setUsernameInput(value) {
        await this.username.addValue(value)
    }

    async setPasswordInput(value) {
        await this.password.addValue(value)
    }
    async setLoginInput(value) {
        await this.login.addValue(value)
    }
    async setClickBtn() {
        await this.createBtn.click()
    }

    async waitForStrScroll() {
        await this.getStr.scrollIntoView()
    }
    
    
    async waitForStrDisplay() {
        await this.tryGitHubBtn.waitForDisplayed({ timeout: 2000 })
    }

    async setTryGitBtn() {
        await this.tryGitHubBtn.click()
    }

    async waitForStrDisplay() {
        await this.getStr2.waitForDisplayed({ timeout: 2000 })
    }

    async setSublinBtn() {
        await this.submitBtn.click()
    }

    async subscribeBtnScroll() {
        await this.subscribeBtn.scrollIntoView()
    }

    async setSubscribeBtn() {
        await this.subscribeBtn.click()
    }

    async waitForSubscribeStrDisplay() {
        await this.checkSubscribeStr.waitForDisplayed({ timeout: 2000 })
    }

        async setEmailInput(value) {
        await this.emailInput.addValue(value)
    }

    async clickOnLoginBtn() {
        await this.countrySelect.click()
    }

    async clickNewsletterCheckbox() {
        await this.checkBox.click()
    }

    async clickFinalSubscribeBtn() {
        await this.finalSubscribeBtn.click()
    }

    async waitForFinalStrDisplay() {
        await this.finalStr.waitForDisplayed({ timeout: 2000 })
    }

    async clickSearchField() {
        await this.searchField.click()
    }

    async setModalSearch(value) {
        await this.moadlSearchField.addValue(value)
    }

    async clickSearchAllBtn() {
        await this.searchAllBtn.click()
    }

    async waitForResultHtmlDisplay() {
        await this.phpSearchResult.waitForDisplayed({ timeout: 2000 })
    }
    
    async clickOnPricingLink() {
        await this.pricingLink.click()
    }

    async waitForTryCopDisplay() {
        await this.tryCopStr.waitForDisplayed({ timeout: 2000 })
    }

    async scrollToCompareStr() {
        await this.compareStrLink.scrollIntoView()
    }

    async clickOnCompareStr() {
        await this.compareStrLink.click()
    }

    async waitForCompareFeatures() {
        await this.compareFeatures.waitForDisplayed({ timeout: 2000 })
    }

}
export default new GitPage()