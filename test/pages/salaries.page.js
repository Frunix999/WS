import { $ } from '@wdio/globals'

class SalariesPage {

    get salariesBtn() { return $('a[href="https://jobs.dou.ua/salaries/"]') }
    get kvartilStr() { return $("//h4[text()='I Квартиль']") }
    get workBtn() { return $('a[href="https://jobs.dou.ua/"]') }
    get searchBtn() { return $("//input[contains(@class, 'dui-button btn-search')]") }
    get searchJobInput() { return $("//input[contains(@class, 'dui-input job')]") }
 
    async clickOnSalariesBtn() {
        await this.salariesBtn.click()
    }

    async waitForPageLoad() {
        await this.kvartilStr.waitForDisplayed({ timeout: 5000 })
    }

    async clickOnWorkBtn() {
        await this.workBtn.click()
    }

    async waitForSearchBtnLoad() {
        await this.searchBtn.waitForDisplayed({ timeout: 5000 })
    }

    async setSearchJobInput(value) {
        await this.searchJobInput.addValue(value)
    }
}


export default new SalariesPage()