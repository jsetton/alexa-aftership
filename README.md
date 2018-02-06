# alexa-aftership

Unofficial Alexa Skill for AfterShip Shipment Tracking Platform

## Disclaimer

**The is an unofficial skill meaning it should only be used for personal usage. I do not have any affiliations with AfterShip or Amazon.**

## Introduction

This skill provides package tracking information using the AfterShip shipment tracking platform API. The information provided is location-aware based on the Echo device configured location country and postal code. All of the location information is normalized via the Google Maps Geocoding API.

It is leveraging the Alexa Skills Kit Command Line Interface (ASK CLI) to streamline the deployment process. This tool is still fairly new which hopefully will improve over time and reduce some of the manual configuration listed below.

## Prerequisites

You need an [AWS account](https://aws.amazon.com) and an [Amazon developer account](https://developer.amazon.com) to create an Alexa Skill.

In order to use the ASK CLI features to automatically deploy and manage your Lambda skill, ensure that you have AWS credentials set up with the appropriate permissions on the computer to which you are installing ASK CLI, as described in [Set Up Credentials for an Amazon Web Services (AWS) Account](https://developer.amazon.com/docs/smapi/set-up-credentials-for-an-amazon-web-services-account.html).

Once you have installed [ASK CLI](https://developer.amazon.com/docs/smapi/quick-start-alexa-skills-kit-command-line-interface.html), you need to initialize it:

```bash
$ ask init
```

## Credentials

### AfterShip

To get tracking information, you need to generate a [AfterShip API Key](https://www.aftership.com/apps/api) associated to your account.

![](screenshots/aftership_api_key.png)

### Google Maps

Access to Google Maps API requires to setup a key. This access is necessary for the skill location features. The total number of requests for this skill should easily be covered by the free tier level. To set this up, please follow these instructions:

1. Create a project or use an existing one on your [Google Cloud Resource Manager Console](https://console.cloud.google.com/cloud-resource-manager). If this is your first time using this service, you will be prompted to setup your account by agreeing to Google Cloud Platform's terms and conditions and provide billing information.

    ![](screenshots/google_cloud_resource_manager.png)

2. Once the project is selected, enable the [Google Maps Geocoding API](https://console.cloud.google.com/apis/library/geocoding-backend.googleapis.com) and [Google Maps Time Zone API](https://console.cloud.google.com/apis/library/timezone-backend.googleapis.com) services.

    ![](screenshots/google_apis_dashboard_geocoding.png) ![](screenshots/google_apis_dashboard_timezone.png)

3. Create an [API key credentials](https://console.cloud.google.com/apis/credentials) by clicking the "Create credentials" blue button and selecting "API key" from the dropdown menu.

    ![](screenshots/google_apis_dashboard_credentials.png)

    The new API key created will show in a popup window as displayed below. Click on the restrict button to customize it.

    ![](screenshots/google_apis_dashboard_api_key_created.png)

    In the key restrictions section, add the two APIs services enabled above in the API restrictions tab. Unfortunately, there isn't much that can be done to restrict the key even at the application level though Google is strongly recommending to do so.

    ![](screenshots/google_apis_dashboard_api_key_restrictions.png)

## Deployment

1. Clone or download this repository. Then you need to download the NodeJS dependencies:

    ```bash
    $ (cd lambda/custom && npm install)
    ```

2. Deploy the skill and the lambda function in one step:

    ```bash
    $ ask deploy
    -------------------- Create Skill Project --------------------
    ask profile for the deployment: default
    Skill Id: amzn1.ask.skill.<Skill ID>
    Skill deployment finished.
    Model deployment finished.
    Lambda deployment finished.
    ```

3. Go to the [lambda function dashboard](https://console.aws.amazon.com/lambda/home?region=us-east-1#/functions/ask-custom-alexa-aftership-default) and add the environment variables for the AfterShip & Google Maps API Keys and the Application Skill ID listed in the previous step, as shown in the screenshot below. **Make sure to click save at the top of the page to apply the settings.**

    ![](screenshots/lambda_env_variables.png)

4. Update the lambda function timeout basic setting from 3 to 6 seconds and the description in the process if you want. You might need to increase the timeout value further if the skill keeps on failing reaching that timeout value.

    ![](screenshots/lambda_basic_settings.png)

5. If you aren't located in the *US/Eastern* time zone, you should also add your [time zone TZ name](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones) to the *DEFAULT_TIMEZONE* variable; same with *DEFAULT_COUNTRY* if not in the *United States*. Here is a list of the other configuration settings that can be set via an environment variable if need to be:

    * *AFTERSHIP_DAYS_PAST_DELIVERED*<br>
    Number of days since delivered packages are still included in results. (Default: 1)
    * *AFTERSHIP_DAYS_SEARCH*<br>
    Number of days since tracking created search query limit. AfterShip only stores data up to 90 days. (Default: 30)
    * *AFTERSHIP_NOTE_TAGGING*<br>
    Filter tracking items based on specific tag(s) part of the AfterShip note field. This can be a regexp. (Default: *disabled*)
    * *AFTERSHIP_TRACKING_COUNT_LIMIT*<br>
    Maximum number of tracking items returned per query. (Default: 20)
    * *MUTE_FOOTNOTES*<br>
    Mute skill location related error notifications at the end of the speech output. (Default: *disabled*)

6. In your [Alexa Skill Console](https://alexa.amazon.com/spa/index.html#skills/your-skills), find the AfterShip skill and enable it. Make sure that the Device Country and Postal Code permission is enabled as shown below.

    ![](screenshots/alexa_skills_enable.png)

7. That should be it! Now, just say to your favorite Echo device: "*Alexa, ask aftership where's my stuff*". If you have any errors, please check the [lambda function logs](https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#logStream:group=/aws/lambda/ask-custom-alexa-aftership-default). If necessary, you can enable the function debug mode, to increase the log verbosity, by setting the lambda function environment variable *DEBUG_MODE* to *on*.
